declare module 'jssip/lib/Transactions' {
    export const checkTransaction
    export class InviteServerTransaction {
        constructor(ua, transport, request)
    }
    export class NonInviteServerTransaction {
        constructor(ua, transport, request)
    }
}