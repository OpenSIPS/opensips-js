// @ts-nocheck

export class Camera {
    private video: HTMLVideoElement | null = null
    private canvas: HTMLCanvasElement | null = null
    private wrapperEl: HTMLDivElement | null = null
    private ctx: CanvasRenderingContext2D | null = null

    constructor () {
        const video = document.createElement('video')
        video.setAttribute('id', 'video')
        video.setAttribute('playsinline', '')
        // Uncomment to flip horizontally as the image from camera is mirrored.
        /*video.style.setProperty('-webkit-transform', 'scaleX(-1)')
        video.style.setProperty('transform', 'scaleX(-1)')*/
        video.style.setProperty('visibility', 'hidden')
        video.style.setProperty('width', 'auto')
        video.style.setProperty('height', 'auto')
        this.video = video

        const canvas = document.createElement('canvas')
        canvas.setAttribute('id', 'output')
        canvas.style.setProperty('visibility', 'hidden')
        this.canvas = canvas

        const divWrapper = document.createElement('div')
        divWrapper.classList.add('canvas-wrapper')
        divWrapper.style.setProperty('display', 'none')
        divWrapper.appendChild(video)
        divWrapper.appendChild(canvas)
        this.wrapperEl = divWrapper

        document.body.appendChild(divWrapper)

        this.ctx = this.canvas.getContext('2d')
    }

    /**
     * Initiate a Camera instance and wait for the camera stream to be ready.
     * @param cameraParam From app `STATE.camera`.
     */
    static async setupCamera (stream) {
        stream.getAudioTracks().forEach(track => {
            track.stop()
            stream.removeTrack(track)
        })

        const camera = new Camera()
        camera.video.srcObject = stream
        // TODO: try without camera.video.volume = 0
        camera.video.volume = 0

        await new Promise((resolve) => {
            camera.video.onloadedmetadata = () => {
                resolve(camera.video)
            }
        })

        camera.video.play()

        const videoWidth = camera.video.videoWidth
        const videoHeight = camera.video.videoHeight
        // Must set below two lines, otherwise video element doesn't show.
        camera.video.width = videoWidth
        camera.video.height = videoHeight

        camera.canvas.width = videoWidth
        camera.canvas.height = videoHeight
        camera.wrapperEl.style.setProperty('width', `${videoWidth}px`)
        camera.wrapperEl.style.setProperty('height', `${videoHeight}px`)

        // Uncomment to flip horizontally as the image from camera is mirrored.
        /*camera.ctx.translate(camera.video.videoWidth, 0)
        camera.ctx.scale(-1, 1)*/

        return camera
    }

    /**
     * Delete all created html elements and canvas context.
     */
    cleanCamera () {
        this.ctx = null
        this.wrapperEl.remove()
    }

    drawToCanvas (canvas) {
        this.ctx.drawImage(
            canvas, 0, 0, this.video.videoWidth, this.video.videoHeight)
    }

    drawFromVideo (ctx) {
        ctx.drawImage(
            this.video, 0, 0, this.video.videoWidth, this.video.videoHeight)
    }

    clearCtx () {
        this.ctx.clearRect(0, 0, this.video.videoWidth, this.video.videoHeight)
    }
}
