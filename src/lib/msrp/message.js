import * as Utils from 'jssip/lib/Utils'

export default class MSRPMessage
{
    constructor (msg)
    {
        this.headers = {}
        if (msg.length > 0)
        {
            let _hasBody = false
            const msgLines = msg.split('\r\n')
            const msgHeadLineArray = msgLines.shift().split(/\s/)
            this.protocol = msgHeadLineArray[0]
            this.ident = msgHeadLineArray[1]
            this.code = (msgHeadLineArray.length > 3) ?
                parseInt(msgHeadLineArray[2]) : 0
            this.method = (msgHeadLineArray.length > 3) ?
                msgHeadLineArray[3] : msgHeadLineArray[2]
            this.body = ''
            for (const msgLine of msgLines) {
                if (msgLine == `-------${this.ident}$`)
                {
                    break
                }
                if (msgLine === '')
                {
                    _hasBody = true
                    continue
                }
                if (msgLine && _hasBody)
                {
                    this.body += `${msgLine}\r\n`
                }
                else
                {
                    const msgLineArray = msgLine.split(': ')
                    this.addHeader(msgLineArray[0], msgLineArray[1].trim())
                }
            }
        }
        else
        {
            this.ident = Utils.createRandomToken(12)
            this.protocol = 'MSRP'
        }
    }

    addHeader (name, content)
    {
        this.headers[name] = content
    }

    getHeader (name)
    {
        return this.headers[name]
    }

    toString ()
    {
        let _msg = `${this.protocol} ${this.ident} ${this.code} ${this.method}`
            .replaceAll(/null\s|undefined\s/ig, '') + '\r\n'
        for (const _header in this.headers)
        {
            _msg += `${_header}: ${this.headers[_header]}\r\n`
        }
        if (this.body)
        {
            _msg += `\r\n${this.body}\r\n`
        }
        _msg += `-------${this.ident}$\r\n`

        return _msg
    }
}


/*


[sub-set-sessionid]
exten => _!.,1,NoOp(Current session id is ${id_session} with header ${SIP_HEADER(P-Asserted-Session)})
 same => n,ExecIF($["${id_session}" != ""]?Set(__OLD_ID_SESSION=${id_session}))
 same => n,AGI(SetSessionID.agi)
 same => n,NoOp(${id_session})
 same => n,SIPRemoveHeader(P-Asserted-Session:)
 same => n,SIPAddHeader(P-Asserted-Session: ${id_session})
 same => n,Set(IAXVAR(id_session_asserted)=${id_session})
 same => n,Set(CDR(id_session)=${id_session})
? same => n,ExecIF($["${OLD_ID_SESSION}" != ""]?GoSub(sub-changeIvrUniqueIdReport,${EXTEN},1))
 same => n,Set(GOSUB_RESULT=${id_session})
? same => n,GoSub(sub-set-guid,${EXTEN},1)
 same => n,Return(SUB-SUCCESS)

exten => h,1,NoOp(Hangup while sub-set-sessionid)
 same => n,AGI(SetSessionID.agi)
 same => n,AGI(SetGUID.agi, ${SIP_HEADER(X-GUID)})
 same => n,Return(SUB-HANGUP)

exten => _!.,1,NoOp(Setting GUID if needed)
 same => n,ExecIf($["${x_guid}" == ""]?AGI(SetGUID.agi,${SIP_HEADER(X-GUID)}):Return())
 same => n,NoOp(${x_guid})
 same => n,SIPRemoveHeader(X-GUID)
 same => n,ExecIf($["${SIP_HEADER(X-GUID)}" == "" & "x_guid" != ""]?SIPAddHeader(X-GUID:${x_guid}))


*/