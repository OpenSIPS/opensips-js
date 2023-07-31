import Utils from 'jssip/lib/Utils'

export class MSRPMessage {

    protocol = ''
    ident = null
    code = null
    method = null
    headers : any = {}
    body = ''
    challenge = null

    constructor (msg : string) {
        if (msg.length > 0) {
            let _hasBody = false
            const msgLines : any = msg.split('\r\n')
            const msgHeadLineArray = msgLines.shift().split(/\s/)
            this.protocol = msgHeadLineArray[0]
            this.ident = msgHeadLineArray[1]
            this.code = (msgHeadLineArray.length > 3) ? msgHeadLineArray[2] : null
            this.method = (msgHeadLineArray.length > 3) ? msgHeadLineArray[3] : msgHeadLineArray[2]
            for (const msgLine of msgLines) {
                if (msgLine == `-------${this.ident}$`) {
                    break
                }
                if (msgLine === '') {
                    _hasBody = true
                    continue
                }
                if (_hasBody) {
                    this.body += msgLine + '\r\n'
                } else {
                    const msgLineArray = msgLine.split(': ')
                    this.addHeader(msgLineArray[0], msgLineArray[1].trim())
                }
            }
        } else {
            this.ident = Utils.createRandomToken(12)
            this.protocol = 'MSRP'
        }
    }

    addHeader (name : string, content : string) {
        this.headers[name] = content
    }

    getHeader (name : string) {
        return this.headers[name]
    }

    toString () {
        let _msg = `${this.protocol} ${this.ident} ${this.code} ${this.method}`.replaceAll(/null\s/ig, '') + '\r\n'
        for (const _header in this.headers) {
            _msg += `${_header}: ${this.headers[_header]}\r\n`
        }
        if (this.body) {
            _msg += '\r\n' + this.body
        }
        _msg += `-------${this.ident}$\r\n`
        return _msg
    }
}