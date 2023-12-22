export function getUIDFromSession (session) {
    return session.target_addr[0].match(/msrp:\/\/(.*?)\./)[1]
}
export function generateUniqueId () {
    const timestamp = Date.now().toString(16) // Convert timestamp to hex
    const randomPart = Math.floor(Math.random() * 1000000).toString(16) // Random part in hex
    return `${timestamp}-${randomPart}`
}
