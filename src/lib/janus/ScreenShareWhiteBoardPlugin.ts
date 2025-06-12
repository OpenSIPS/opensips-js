// @ts-nocheck
import { ConferencingModeType } from './enum/conferencing.enum'
import { KonvaDrawer } from './utils/KonvaDrawer'
import { KonvaDrawerOptions } from './types/konvaDrawer'
import { BaseProcessStreamPlugin } from '@/lib/janus/BaseProcessStreamPlugin'

interface ScreenShareWhiteboardSelectors {
    container: string
    compositeCanvasContainer: string
    compositeCanvas: string
    drawerContainer: string
    videoElement: string
    videoElementContainer: string
    document: HTMLElement
}

const defaultElementSelectors: ScreenShareWhiteboardSelectors = {
    container: 'screen-share-video-container',
    compositeCanvasContainer: 'composite-canvas-container',
    compositeCanvas: 'composite-canvas',
    drawerContainer: 'container',
    videoElement: 'whiteboard-source-video',
    videoElementContainer: 'whiteboard-wrapper',
}

interface ScreenShareWhiteboardOptions {
    selectors: ScreenShareWhiteboardSelectors
}

export class ScreenShareWhiteBoardPlugin extends BaseProcessStreamPlugin{
    private video: HTMLVideoElement | null = null
    private wrapperEl: HTMLDivElement | null = null
    private screenShareKonvaDrawer: KonvaDrawer | null = null
    private initialStream: MediaStream | null = null
    private imageSrc: string | null = null
    private konvaDrawer: KonvaDrawer | null = null
    public mode: ConferencingModeType = undefined
    private screenSharePlugin: unknown = null
    private selectors: Partial<ScreenShareWhiteboardSelectors> = {}

    constructor (screenSharePlugin, options: Partial<ScreenShareWhiteboardOptions> = {}) {
        super('ScreenShareWhiteboard', 'screen')

        this.screenSharePlugin = screenSharePlugin

        this.selectors = {
            ...defaultElementSelectors,
            ...(options.selectors || {})
        }

        if (!this.selectors.document) {
            this.selectors.document = document
        }
    }

    private createVideoElement () {
        const video = document.createElement('video')
        video.setAttribute('id', this.selectors.videoElement)
        video.setAttribute('autoplay', '')
        // Uncomment to flip horizontally as the image from camera is mirrored.
        /*video.style.setProperty('-webkit-transform', 'scaleX(-1)')
    video.style.setProperty('transform', 'scaleX(-1)')*/
        video.style.setProperty('visibility', 'hidden')
        video.style.setProperty('width', 'auto')
        video.style.setProperty('height', 'auto')
        this.video = video

        const divWrapper = document.createElement('div')
        divWrapper.classList.add(this.selectors.videoElementContainer)
        divWrapper.style.setProperty('display', 'none')
        divWrapper.appendChild(video)

        this.wrapperEl = divWrapper

        if (this.selectors.document.body) {
            this.selectors.document.body.appendChild(divWrapper)
        } else {
            this.selectors.document.appendChild(divWrapper)
        }
    }

    private getAspectRatioDimensions (stream: MediaStream, wrapperEl: HTMLElement) {
        const streamSettings = stream.getTracks()[0].getSettings()

        const wrapperWidth = wrapperEl.clientWidth
        const wrapperHeight = wrapperEl.clientHeight

        const videoStreamWidth = streamSettings.width
        const videoStreamHeight = streamSettings.height

        // Calculate aspect ratio
        const videoAspectRatio = videoStreamWidth / videoStreamHeight
        const wrapperAspectRatio = wrapperWidth / wrapperHeight

        let width = 0
        let height = 0

        // Determine which aspect ratio is limiting
        if (videoAspectRatio > wrapperAspectRatio) {
            // Limited by width
            width = wrapperWidth
            height = wrapperWidth / videoAspectRatio
        } else {
            // Limited by height
            height = wrapperHeight
            width = wrapperHeight * videoAspectRatio
        }

        return {
            width,
            height
        }
    }

    /**
   * Starts stream processing to add mask effect for it
   * This method is useful in cases like drawing over the screen share as we
   * already have a screen share stream and there is no need to create another one
   * @param {MediaStream} stream
   * @return {MediaStream} processed stream with mask effect
   */
    public async start (stream) {
        this.createVideoElement()

        this.initialStream = stream
        this.video.srcObject = stream.clone()

        const wrapperEl = this.selectors.document.getElementById(this.selectors.container)
        wrapperEl.style.setProperty('position', 'relative')
        wrapperEl.style.setProperty('min-width', '100%')
        wrapperEl.style.setProperty('height', '100%')
        wrapperEl.style.setProperty('display', 'flex')
        wrapperEl.style.setProperty('justify-content', 'center')

        const compositeCanvasContainerEl = this.selectors.document.getElementById(this.selectors.compositeCanvasContainer)
        compositeCanvasContainerEl.style.setProperty('position', 'relative')
        compositeCanvasContainerEl.style.setProperty('margin', 'auto 0')

        const { width, height } = this.getAspectRatioDimensions(stream, wrapperEl)
        let shareWidth = width, shareHeight = height

        const konvaContainer = this.selectors.document.getElementById(this.selectors.drawerContainer)

        this.screenShareKonvaDrawer = new KonvaDrawer({
            container: konvaContainer,
            width: shareWidth,
            height: shareHeight
        })

        const layer = this.screenShareKonvaDrawer.addLayer()
        this.screenShareKonvaDrawer.initFreeDrawing(layer)

        const container = this.selectors.document.getElementById(this.selectors.drawerContainer)
        const canvas = container.querySelector('canvas')
        const canvasContent = container.querySelector('.konvajs-content')


        const compositeCanvas = this.selectors.document.getElementById(this.selectors.compositeCanvas) as HTMLCanvasElement
        compositeCanvas.style.setProperty('position', 'absolute')
        compositeCanvas.style.setProperty('top', '0')
        compositeCanvas.style.setProperty('left', '0')

        const compositeCtx = compositeCanvas.getContext('2d')

        const resizeCanvasElements = () => {
            const { width, height } = this.getAspectRatioDimensions(stream, wrapperEl)
            shareWidth = width
            shareHeight = height

            // Set dimensions similar to the drawing canvas or screen capture
            canvas.width = width
            canvas.height = height
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`

            canvasContent.style.width = `${width}px`
            canvasContent.style.height = `${height}px`

            compositeCanvasContainerEl.style.height = `${height}px`

            compositeCanvas.width = width
            compositeCanvas.height = height
        }

        resizeCanvasElements()
        // TODO Remove once detached
        window.addEventListener('resize', () => {
            resizeCanvasElements()
            this.screenShareKonvaDrawer.addWakeupLine(layer)
        })

        const screenVideo = this.video

        const draw = ()=>  {
            // Draw the video frame
            compositeCtx.drawImage(screenVideo, 0, 0, shareWidth, shareHeight)

            // Draw the drawing canvas
            compositeCtx.drawImage(canvas, 0, 0, shareWidth, shareHeight)

            requestAnimationFrame(draw)
        }

        draw()

        return compositeCanvas.captureStream(30) // 30 FPS
    }

    /**
   * Stops stream processing
   */
    public stop () {
        this.initialStream = null
        this.video = null
        this.wrapperEl = null
        this.screenShareKonvaDrawer = null
    }

    public setupScreenShareDrawerOptions (options: KonvaDrawerOptions) {
        if (this.screenShareKonvaDrawer) {
            this.screenShareKonvaDrawer.setupDrawerOptions(options)
        }
    }
}
