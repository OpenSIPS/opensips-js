let lastId = 0

export default function (prefix = 'uid-') {
    const localPrefix = prefix
    return function () {
        lastId++
        return `${localPrefix}${lastId}`
    }
}
