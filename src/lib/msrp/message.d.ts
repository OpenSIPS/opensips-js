export default class MSRPMessage {
    protocol: string
    ident: string
    code: number
    method: string
    headers: any
    body: string

    constructor(msg: string)
    addHeader(name: string, content: string): void
    getHeader(name: string): string
    toString(): string
}