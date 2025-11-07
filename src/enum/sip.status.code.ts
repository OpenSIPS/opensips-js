/**
 * SIP Response Status Codes
 * @see https://www.iana.org/assignments/sip-parameters/sip-parameters.xhtml#sip-parameters-7
 */
export const SIP_STATUS_CODE = {
    // 1xx - Provisional Responses
    TRYING: 100,
    RINGING: 180,
    SESSION_PROGRESS: 183,
    
    // 2xx - Successful Responses
    OK: 200,
    
    // 3xx - Redirection Responses
    MOVED_TEMPORARILY: 302,
    
    // 4xx - Client Failure Responses
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    REQUEST_TIMEOUT: 408,
    BUSY_HERE: 486,
    REQUEST_TERMINATED: 487,
    
    // 5xx - Server Failure Responses
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    
    // 6xx - Global Failure Responses
    BUSY_EVERYWHERE: 600,
    DECLINE: 603
} as const

export type SipStatusCode = typeof SIP_STATUS_CODE[keyof typeof SIP_STATUS_CODE]

