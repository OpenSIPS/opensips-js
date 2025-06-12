import '@tensorflow/tfjs-backend-webgl'
//import '@tensorflow/tfjs-backend-webgpu'
import * as mpSelfieSegmentation from '@mediapipe/selfie_segmentation'
import * as tfjsWasm from '@tensorflow/tfjs-backend-wasm'
import type { BodySegmenter } from '@tensorflow-models/body-segmentation'
import * as bodySegmentation from '@tensorflow-models/body-segmentation'
import { setBackendAndEnvFlags } from './utils/tfjsBackendAndEnvFlags'
import { Camera } from './utils/Camera'
import { mergeConfig, requestAnimationFrameTimeout } from './utils/util'
import {
    CAMERA_CONFIG,
    ENV_FLAGS,
    SEGMENTER_CONFIG,
    VISUALIZATION_CONFIG,
    MASK_EFFECT_TYPE_CONFIG,
    MaskEffectTypeConfigType,
    VisualizationConfigType
} from './enum/tfjs.config.enum'
import { TimeoutType, VisibilityStateType } from './types/streamMask'
import { BaseProcessStreamPlugin } from '@/lib/janus/BaseProcessStreamPlugin'

interface StreamMaskOptions {
    effect: MaskEffectTypeConfigType
    base64Image?: string
    visualizationConfig?: VisualizationConfigType
}

interface PluginConfig {
    immediate: boolean
}

tfjsWasm.setWasmPaths(`https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${tfjsWasm.version_wasm}/dist/`)

export class StreamMaskPlugin extends BaseProcessStreamPlugin {
    private visualizationConfig: VisualizationConfigType = {}
    private maskEffectType: MaskEffectTypeConfigType | null = null
    private base64ImageMask: string | null = null
    private rafId: number | null = null
    private timeoutId: TimeoutType | null = null
    private segmenter: BodySegmenter = null
    private camera
    private canvas
    private ctx
    private visibilityState: VisibilityStateType | null = null

    constructor (options: StreamMaskOptions, pluginConfig?: PluginConfig) {
        super('StreamMask', 'video', pluginConfig)

        const { visualizationConfig, effect, base64Image } = options

        this.visualizationConfig = mergeConfig(VISUALIZATION_CONFIG, visualizationConfig)

        if (effect === MASK_EFFECT_TYPE_CONFIG.backgroundImageEffect && !base64Image) {
            throw new Error('Error when starting mask effect: base64Image option is required ' +
                'for backgroundImageEffect effect type')
        }

        if (base64Image) {
            this.base64ImageMask = base64Image
        }

        this.maskEffectType = effect
    }

    /**
   * Starts stream processing to add mask effect for it
   * @param {MediaStream} stream
   * @param {'bokehEffect' | 'backgroundImageEffect'} effect - defines the mask effect type
   * @param {MediaStreamConstraints} options - media stream constraints
   * @param {object} options - (optional) additional mask effect options
   * @return {MediaStream} processed stream with mask effect
   */
    public async start (stream) {
        this.canvas = document.createElement('canvas')
        this.ctx = this.canvas.getContext('2d')

        /*stream.getTracks().forEach(track => {
            track.stop()
            stream.removeTrack(track)
        })

        return await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        })*/

        this.camera = await Camera.setupCamera(stream)

        this.canvas.width = this.camera.canvas.width
        this.canvas.height = this.camera.canvas.height

        //await tf.setBackend('webgpu')

        await setBackendAndEnvFlags(ENV_FLAGS)

        this.segmenter = await this.createSegmenter()

        this.processVisibilityChange()
        this.renderPrediction()

        const videoOnlyStream = this.canvas.captureStream(CAMERA_CONFIG.targetFPS)

        return await this.populateWithAudioTracks(videoOnlyStream, stream.getAudioTracks())
    }

    /**
     * Listens to visibility change (like switching active tab)
     * and switches between different kinds of requestAnimationFrame
     */
    private processVisibilityChange () {
        if (!document) {
            return
        }

        this.visibilityState = document.visibilityState

        document.addEventListener('visibilitychange', () => {
            this.visibilityState = document.visibilityState
            if (document.visibilityState === 'hidden') {
                this.renderPrediction()
            }
        })
    }

    /**
     * Adds audio tracks to MediaStream which contains only video tracks
     * @param {MediaStream} stream - stream with only video tracks
     * @param {MediaStreamConstraints} options - media stream constraints
     * @return {MediaStream} combined stream with both audio and video tracks
     */
    private async populateWithAudioTracks (videoOnlyStream: MediaStream, audioTracks: Array<MediaStreamTrack>) {
        const combinedStream = new MediaStream()

        videoOnlyStream.getVideoTracks().forEach(track => {
            combinedStream.addTrack(track)
        })

        audioTracks.forEach(track => {
            combinedStream.addTrack(track)
        })

        return combinedStream
    }

    /**
   * Stops stream processing
   */
    public stop () {
        if (this.rafId) {
            window.cancelAnimationFrame(this.rafId)
        }
        if (this.timeoutId) {
            clearTimeout(this.timeoutId)
        }
        if (this.segmenter) {
            this.segmenter.dispose()
        }

        if (this.camera) {
            this.camera.cleanCamera()
        }

        this.rafId = null
        this.timeoutId = null
        //this.maskEffectType = null
        //this.base64ImageMask = null
        this.segmenter = null
        this.camera = null
        this.canvas = null
        this.ctx = null
    }

    public setupVisualizationConfig (config: VisualizationConfigType) {
        this.visualizationConfig = mergeConfig(this.visualizationConfig, config)
    }

    /**
   * Starts rendering process by calling itself recursively.
   * Uses requestAnimationFrame method for recursive invoking.
   */
    private async renderPrediction () {
        await this.renderResult()

        if (this.visibilityState === 'visible') {
            if (this.timeoutId) {
                clearTimeout(this.timeoutId)
            }
            this.rafId = requestAnimationFrame(this.renderPrediction.bind(this))
        } else {
            if (this.rafId) {
                window.cancelAnimationFrame(this.rafId)
            }
            this.timeoutId = requestAnimationFrameTimeout(this.renderPrediction.bind(this))
        }
    }

    /**
   * Creates Body Segmenter which is used for people segmentation and poses estimation
   * @return {segmenter} segmenter instance
   */
    private async createSegmenter () {
        return bodySegmentation.createSegmenter(bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation, {
            runtime: SEGMENTER_CONFIG.runtime,
            modelType: SEGMENTER_CONFIG.modelType,
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747'
        }
        )
    }

    /**
   * Render function which draws masked effect to canvas.
   */
    private async renderResult () {
        // ReadyState >= 2 means that video data is ready to be played
        if (this.camera.video.readyState < 2) {
            await new Promise((resolve) => {
                this.camera.video.onloadeddata = () => {
                    resolve(this.camera.video)
                }
            })
        }

        let segmentation = null

        /* Segmenter can be null if initialization failed (for example when loading from a URL that does not exist). */

        if (this.segmenter != null) {
            /* Detectors can throw errors, for example when using custom URLs that contain a model that doesn't provide the expected output. */

            try {
                if (this.segmenter.segmentPeople != null) {
                    segmentation = await this.segmenter.segmentPeople(this.camera.video, {
                        flipHorizontal: false,
                        multiSegmentation: false,
                        segmentBodyParts: true,
                        segmentationThreshold: this.visualizationConfig.foregroundThreshold
                    })
                } else {
                    segmentation = await this.segmenter.estimatePoses(
                        this.camera.video,
                        { flipHorizontal: false }
                    )
                    segmentation = segmentation.map(singleSegmentation => singleSegmentation.segmentation)
                }
            } catch (error) {
                this.segmenter.dispose()
                this.segmenter = null
                alert(error)
            }

            /* Code in node_modules/@mediapipe/selfie_segmentation/selfie_segmentation.js
      must be modified to expose the webgl context it uses. */
            const gl = window.exposedContext

            if (gl)
                gl.readPixels(
                    0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
        }

        /* The null check makes sure the UI is not in the middle of changing to a
    different model. If during model change, the result is from an old model,
    which shouldn't be rendered. */

        if (segmentation && segmentation.length > 0) {
            switch (this.maskEffectType) {
                case MASK_EFFECT_TYPE_CONFIG.bokehEffect:
                    await this.applyBokehEffect(segmentation)
                    break
                case MASK_EFFECT_TYPE_CONFIG.backgroundImageEffect:
                    await this.applyBackgroundImageEffect(segmentation)
                    break
                default:
                    console.error('Error when applying mask effect: such mask effect doesn\'t exist')
            }
            //await this.applyBokehEffect(segmentation)
            //await this.applyBackgroundImageEffect(segmentation)
        }
        this.camera.drawToCanvas(this.canvas)
    }

    private async applyBokehEffect (segmentation) {
        const options = this.visualizationConfig

        await bodySegmentation.drawBokehEffect(
            this.canvas,
            this.camera.video,
            segmentation,
            options.foregroundThreshold,
            options.backgroundBlur,
            options.edgeBlur
        )
    }

    private async applyBackgroundImageEffect (segmentation) {
        const base64BackgroundImage = this.base64ImageMask
        const backgroundImage = new Image()
        backgroundImage.src = base64BackgroundImage

        const ctx = this.canvas.getContext('2d')

        const background = {
            r: 0,
            g: 0,
            b: 0,
            a: 0
        }
        const mask = await bodySegmentation.toBinaryMask(segmentation, background, {
            r: 0,
            g: 0,
            b: 0,
            a: 255
        })

        if (mask) {
            ctx.putImageData(mask, 0, 0)
            ctx.globalCompositeOperation = 'source-in'

            // 3. Drawing the Background
            if (backgroundImage.complete) {
                ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height)
            } else {
                backgroundImage.onload = () => {
                    ctx.drawImage(backgroundImage, 0, 0, this.canvas.width, this.canvas.height)
                }
            }

            ctx.globalCompositeOperation = 'destination-over'
            ctx.drawImage(this.camera.video, 0, 0, this.canvas.width, this.canvas.height)
            ctx.globalCompositeOperation = 'source-over'

            // Add a delay to control the frame rate (adjust as needed) less CPU intensive
            // await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
}
