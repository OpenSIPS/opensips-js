/**
 * Invokes a function with given arguments
 * @param handler function
 * @param payload
 * @return {*} function result
 */
export function invokeFunction (handler, payload) {
    return payload ? handler.apply(null, [ payload ]) : handler.call(null, payload)
}

/**
 * Converts an Array-like object to a real Array.
 * @param list array like object
 * @param start index
 * @return {any[]} real array
 */
export function toArray (list, start = 0) {
    let i = list.length - start
    const ret = new Array(i)
    while (i--) {
        ret[i] = list[i + start]
    }
    return ret
}

/**
 * Generates random string based on a given string length
 * @param {number} len
 * @return {string}
 */
export function randomString (len) {
    const charSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let randomStr = ''
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < len; i++) {
        const randomPoz = Math.floor(Math.random() * charSet.length)
        randomStr += charSet.substring(randomPoz, randomPoz + 1)
    }
    return randomStr
}

/**
 * Merges the default config and the passed one
 * @param {object} defaultConfig
 * @param {object} config
 * @return {object} merged config
 */
export function mergeConfig (defaultConfig, config = {}) {
    const finalConfig = {}
    Object.keys(defaultConfig).forEach((key) => {
        finalConfig[key] = config[key] !== undefined ? config[key] : defaultConfig[key]
    })

    return finalConfig
}

export function loadImage (src) {
    return new Promise((resolve, reject) => {
        const image = new Image()

        image.onload = () => {
            resolve(image)
        }

        image.onerror = (error) => {
            reject(error)
        }

        image.src = src
    })
}

export function requestAnimationFrameTimeout (callback) {
    return setTimeout(callback, 1000 / 30)
}

export function stringToBase64 (str: string) {
    return btoa(unescape(encodeURIComponent(str)))
}
