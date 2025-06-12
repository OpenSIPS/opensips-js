import * as tf from '@tensorflow/tfjs-core'
import { TUNABLE_FLAG_VALUE_RANGE_MAP } from '../enum/tfjs.config.enum'

/**
 * Set environment flags.
 *
 * This is a wrapper function of `tf.env().setFlags()` to constrain users to
 * only set tunable flags (the keys of `TUNABLE_FLAG_TYPE_MAP`).
 *
 * @param flagConfig An object to store flag-value pairs.
 */
export async function setBackendAndEnvFlags (flagConfig) {
    if (flagConfig == null) {
        return
    } else if (typeof flagConfig !== 'object') {
        throw new Error(
            `An object is expected, while a(n) ${typeof flagConfig} is found.`)
    }

    // Check the validation of flags and values.
    for (const flag in flagConfig) {
        if (!(flag in TUNABLE_FLAG_VALUE_RANGE_MAP)) {
            throw new Error(`${flag} is not a tunable or valid environment flag.`)
        }
        if (TUNABLE_FLAG_VALUE_RANGE_MAP[flag].indexOf(flagConfig[flag]) === -1) {
            throw new Error(
                `${flag} value is expected to be in the range [${
                    TUNABLE_FLAG_VALUE_RANGE_MAP[flag]}], while ${flagConfig[flag]}` +
        ' is found.')
        }
    }

    tf.env().setFlags(flagConfig)
}
