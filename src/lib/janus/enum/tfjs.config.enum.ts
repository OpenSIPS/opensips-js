import { MediaPipeSelfieSegmentationModelType } from '@tensorflow-models/body-segmentation'

/**
 * Config used for MediaPipeSelfieSegmentation bodySegmentation model.
 */
interface ISegmenterConfig {
    runtime: 'mediapipe',
    modelType: MediaPipeSelfieSegmentationModelType
}
export const SEGMENTER_CONFIG: ISegmenterConfig = {
    runtime: 'mediapipe',
    modelType: 'general'
}

/**
 * Flags used for tf.env().setFlags method for optimization purposes.
 */
export const ENV_FLAGS = {
    WEBGL_PACK: true,           // Enable WebGL auto-tuning (default: true)
    WEBGL_VERSION: 2,           // Use WebGL 2 (default: 1)
    WEBGL_CPU_FORWARD: false,   // Force CPU forward (default: false)
} as const

/**
 * Config used for video stream configuration and capture.
 */
export const CAMERA_CONFIG = {
    targetFPS: 60
}

export type VisualizationConfigType = {
    foregroundThreshold?: number
    maskOpacity?: number
    maskBlur?: number
    pixelCellWidth?: number
    backgroundBlur?: number
    edgeBlur?: number
}

/**
 * Config used for image segmentation and bokeh effect drawing.
 */
export const VISUALIZATION_CONFIG: VisualizationConfigType = {
    foregroundThreshold: 0.5,
    maskOpacity: 0.7,
    maskBlur: 0,
    pixelCellWidth: 10,
    backgroundBlur: 15, // How many pixels in the background blend into each other. Should be between 1 and 20.
    edgeBlur: 3 // How many pixels to blur on the edge between the person and the background by. Should be between 0 and 20.
}

/**
 * This map descripes tunable flags and theior corresponding types.
 *
 * The flags (keys) in the map satisfy the following two conditions:
 * - Is tunable. For example, `IS_BROWSER` and `IS_CHROME` is not tunable,
 * because they are fixed when running the scripts.
 * - Does not depend on other flags when registering in `ENV.registerFlag()`.
 * This rule aims to make the list streamlined, and, since there are
 * dependencies between flags, only modifying an independent flag without
 * modifying its dependents may cause inconsistency.
 * (`WEBGL_RENDER_FLOAT32_CAPABLE` is an exception, because only exposing
 * `WEBGL_FORCE_F16_TEXTURES` may confuse users.)
 */
export const TUNABLE_FLAG_VALUE_RANGE_MAP = {
    WEBGL_VERSION: [ 1, 2 ],
    WASM_HAS_SIMD_SUPPORT: [ true, false ],
    WASM_HAS_MULTITHREAD_SUPPORT: [ true, false ],
    WEBGL_CPU_FORWARD: [ true, false ],
    WEBGL_PACK: [ true, false ],
    WEBGL_FORCE_F16_TEXTURES: [ true, false ],
    WEBGL_RENDER_FLOAT32_CAPABLE: [ true, false ],
    WEBGL_FLUSH_THRESHOLD: [ -1, 0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2 ],
    CHECK_COMPUTATION_FOR_ERRORS: [ true, false ],
}

export type MaskEffectTypeConfigType = 'bokehEffect' | 'backgroundImageEffect'
export type MaskEffectConfigType = {
    [key in MaskEffectTypeConfigType]: MaskEffectTypeConfigType
}
export const MASK_EFFECT_TYPE_CONFIG: MaskEffectConfigType = {
    bokehEffect: 'bokehEffect',
    backgroundImageEffect: 'backgroundImageEffect'
}

export interface StartMaskEffectOptions {
    base64Image?: string
}
