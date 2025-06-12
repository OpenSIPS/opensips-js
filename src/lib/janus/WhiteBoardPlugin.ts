// @ts-nocheck
import { loadImage } from './utils/util'
import { CONFERENCING_MODE, ConferencingModeType } from './enum/conferencing.enum'
import { KonvaDrawer } from './utils/KonvaDrawer'
import { KonvaDrawerOptions } from './types/konvaDrawer'
import { BaseNewStreamPlugin } from '@/lib/janus/BaseNewStreamPlugin'

interface WhiteboardElementSelectors {
    container: string
    drawerContainer: string
    konvaContainer: HTMLElement
    document: HTMLElement
}

interface WhiteboardOptions {
    mode: ConferencingModeType
    imageSrc?: string
    selectors: Partial<WhiteboardElementSelectors>
}

const defaultElementSelectors: WhiteboardElementSelectors = {
    container: 'presentation-video-container',
    drawerContainer: 'presentationCanvasWrapper'
}

export class WhiteBoardPlugin extends BaseNewStreamPlugin {
    private visualizationConfig = {}
    private rafId: number | null = null
    private imageSrc: string | null = null
    private konvaDrawer: KonvaDrawer | null = null
    private selectors: Partial<WhiteboardElementSelectors> = {}
    public mode: ConferencingModeType = undefined

    constructor (options: WhiteboardOptions) {
        super('WhiteBoard')

        this.mode = options.mode
        if (options.imageSrc) {
            this.imageSrc = options.imageSrc
        }

        this.selectors = {
            ...defaultElementSelectors,
            ...(options.selectors || {})
        }

        if (!this.selectors.document) {
            this.selectors.document = document
        }
    }

    public setupDrawerOptions (options: KonvaDrawerOptions) {
        if (this.konvaDrawer) {
            this.konvaDrawer.setupDrawerOptions(options)
        }
    }

    public setMode (mode: ConferencingModeType, imageSrc?: string) {
        this.mode = mode

        if (imageSrc) {
            this.imageSrc = imageSrc
        }
    }

    public setupDrawerImage (imageSrc) {
        this.imageSrc = imageSrc
    }

    private drawEmptyWhiteboard () {
        const wrapperEl = this.selectors.document.getElementById(this.selectors.container)
        wrapperEl.style.setProperty('min-width', '100%')
        wrapperEl.style.setProperty('height', '100%')

        const width = wrapperEl.clientWidth
        const height = wrapperEl.clientHeight

        const konvaContainer = this.selectors.document.getElementById(this.selectors.drawerContainer)

        this.konvaDrawer = new KonvaDrawer({
            container: konvaContainer,
            width: width,
            height: height
        })

        const layer = this.konvaDrawer.addLayer()
        this.konvaDrawer.addRect(layer, width, height)

        this.konvaDrawer.initFreeDrawing(layer)
    }

    private async drawImageWhiteboard () {
        const wrapperEl = this.selectors.document.getElementById(this.selectors.container)
        wrapperEl.style.setProperty('min-width', '100%')
        wrapperEl.style.setProperty('height', '100%')

        const width = wrapperEl.clientWidth
        const height = wrapperEl.clientHeight

        const imageObj = await loadImage(this.imageSrc)

        const konvaContainer = this.selectors.document.getElementById(this.selectors.drawerContainer)

        this.konvaDrawer = new KonvaDrawer({
            container: konvaContainer,
            width: width,
            height: height
        })

        const layer = this.konvaDrawer.addLayer()
        this.konvaDrawer.addImage(layer, imageObj)
        layer.batchDraw()

        this.konvaDrawer.initFreeDrawing(layer)
    }

    public async generateStream () {
        if (this.mode === CONFERENCING_MODE.WHITEBOARD) {
            this.drawEmptyWhiteboard()
        } else if (this.mode === CONFERENCING_MODE.IMAGE_WHITEBOARD) {
            await this.drawImageWhiteboard()
        } else {
            return
        }

        const container = this.selectors.document.getElementById(this.selectors.drawerContainer)
        const canvas = container.querySelector('canvas')

        const presentationCtx = canvas.getContext('2d')

        function draw () {
            presentationCtx.fillRect(0,0,1,1)

            requestAnimationFrame(draw)
        }

        draw()

        const presentationCanvasStream = canvas.captureStream(30)

        this.stream = presentationCanvasStream
    }

    public async kill () {
        this.konvaDrawer = null

        await this.stop()
        this.session._ua.emit('stopWhiteboard')
    }
}
