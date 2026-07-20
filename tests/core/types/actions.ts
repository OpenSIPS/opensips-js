/*******************************/
/* BASE INTERFACES FOR ACTIONS */
/*******************************/
import { APIRequestContext } from 'playwright-core'
import { EventType } from './events'

// Base success response - all successful responses extend this
export interface BaseActionSuccessResponse {
    success: true
    // Any additional properties allowed
    [key: string]: any
}

// Base error response - standardized error format
export interface ActionErrorResponse {
    success: false
    error: string // User-friendly error message
}

// Base expectation interface
export interface BaseActionExpectation {
    // The type of expectation to check
    type: string
    // Optional description for better error messages
    description?: string
    // Additional properties specific to the expectation type
    [key: string]: any
}

// WebSocket message expectation
export interface WebSocketMessageExpectation extends BaseActionExpectation {
    type: 'websocket'
    method: string
    status_code?: number
    timeout?: number
    checkSentEvent?: boolean
}

// Response expectation
export interface ResponseExpectation<ResponseType = any> extends BaseActionExpectation {
    type: 'response'
    // Specify exact properties to match
    properties?: Partial<ResponseType>
}

// Union type for all expectation types, generic over result type
export type Expectation<ResultType = any> =
    | WebSocketMessageExpectation
    | ResponseExpectation<ResultType>

// Union type for all action responses
export type ActionResponse<TSuccess extends BaseActionSuccessResponse = BaseActionSuccessResponse> =
    | TSuccess
    | ActionErrorResponse

interface ActionResponseToContextEnabled {
    // The action will set the response to the context
    setToContext: true
    // The key to set in the context
    contextKeyToSet: string
}
interface ActionResponseToContextDisabled {
    // The action will not set the response to the context
    setToContext: false
    // The key to set in the context
    contextKeyToSet?: never
}
export type ActionResponseToContext =
    | ActionResponseToContextEnabled
    | ActionResponseToContextDisabled

export interface ActionWaitUntil {
    // The event to wait for
    event: EventType
    // The timeout in milliseconds to execute the action if the event is not triggered
    timeout?: number
}

export interface ActionData<
    Payload extends object | undefined = undefined,
    ResponseType extends BaseActionSuccessResponse = BaseActionSuccessResponse
> {
    // The data of the action to execute
    payload?: Payload

    // Configuration of the context modification after the action
    responseToContext?: ActionResponseToContext

    // The events to wait for before executing the action
    waitUntil?: Array<ActionWaitUntil>

    // Custom event to trigger after the action
    customSharedEvent?: string

    // Expectations for this action
    // Outer array: OR logic (any of these groups can pass)
    // Inner array: AND logic (all expectations in a group must pass)
    expect?: Expectation<ResponseType>[][]
}

export interface BaseActionDefinition<
    Type extends string,
    Payload extends object | undefined = undefined,
    ResponseType extends BaseActionSuccessResponse = BaseActionSuccessResponse
> {
    type: Type
    data?: ActionData<Payload, ResponseType>
}

export interface Action<
    Type extends string,
    Payload extends object | undefined = undefined,
    SuccessResponse extends BaseActionSuccessResponse = BaseActionSuccessResponse
> {
    definition: BaseActionDefinition<Type, Payload, SuccessResponse>
    response: ActionResponse<SuccessResponse>
}

/*******************************/
/* SPECIFIC ACTIONS INTERFACES */
/*******************************/

/* Register */
interface RegisterActionPayload {
    sip_domain: string
    username: string
    password: string
}
interface RegisterActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    instanceId: string
}
export type RegisterAction = Action<
    'register',
    RegisterActionPayload,
    RegisterActionSuccessResponse
>

/* Dial */
interface DialActionPayload {
    target: string
}
interface DialActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    target: string
    callId: string
}
export type DialAction = Action<
    'dial',
    DialActionPayload,
    DialActionSuccessResponse
>

/* Wait */
interface WaitActionPayload {
    // The time to wait in milliseconds
    time: number
}
interface WaitActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
}
export type WaitAction = Action<
    'wait',
    WaitActionPayload,
    WaitActionSuccessResponse
>

/* Play Sound */
interface PlaySoundActionPayload {
    // The sound to play, can be a URL or a file path
    sound: string
}
interface PlaySoundActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
}
export type PlaySoundAction = Action<
    'playSound',
    PlaySoundActionPayload,
    PlaySoundActionSuccessResponse
>

/* Answer */
interface AnswerActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    callId: string
}
export type AnswerAction = Action<
    'answer',
    undefined,
    AnswerActionSuccessResponse
>

/* Hold */
interface HoldActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    callId: string
}
export type HoldAction = Action<
    'hold',
    undefined,
    HoldActionSuccessResponse
>

/* Unhold */
interface UnholdActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    callId: string
}
export type UnholdAction = Action<
    'unhold',
    undefined,
    UnholdActionSuccessResponse
>

/* Hangup */
interface HangupActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    callId: string
}
export type HangupAction = Action<
    'hangup',
    undefined,
    HangupActionSuccessResponse
>

/* Send DTMF */
interface SendDTMFActionPayload {
    // The DTMF number to send
    dtmf: string
}
interface SendDTMFActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    dtmf: string
    callId: string
}
export type SendDTMFAction = Action<
    'sendDTMF',
    SendDTMFActionPayload,
    SendDTMFActionSuccessResponse
>

/* Transfer */
interface TransferActionPayload {
    // The target to transfer the call to
    target: string
}
interface TransferActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    callId: string
}
export type TransferAction = Action<
    'transfer',
    TransferActionPayload,
    TransferActionSuccessResponse
>

/* Room Transfer */
interface RoomTransferActionPayload {
    fromRoom: number
    toRoom: number
}

interface RoomTransferActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    fromRoom: number
    toRoom: number
    transferId: string
}

export type RoomTransferAction = Action<
    'roomTransfer',
    RoomTransferActionPayload,
    RoomTransferActionSuccessResponse
>
/* DND */
interface DNDActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
}
export type DNDAction = Action<
    'DND',
    undefined,
    DNDActionSuccessResponse
>

/* Unregister */
interface UnregisterActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
}
export type UnregisterAction = Action<
    'unregister',
    undefined,
    UnregisterActionSuccessResponse
>

/* Request */
interface RequestActionPayload {
    url: string
    options: Parameters<APIRequestContext['fetch']>[1]
}
interface RequestActionSuccessResponse extends BaseActionSuccessResponse {
    success: true
    response: any // The actual API response
}
export type RequestAction = Action<
    'request',
    RequestActionPayload,
    RequestActionSuccessResponse
>

/****************/
/* Helper types */
/****************/
export type GetActionDefinition<T extends Action<any, any, any>> = T['definition']
export type GetActionResponse<T extends Action<any, any, any>> = T['response']
export type GetActionData<T extends Action<any, any, any>> = GetActionDefinition<T>['data']
export type GetActionPayload<T extends Action<any, any, any>> = GetActionData<T>['payload']

// Type-safe action executor function
type ActionExecutorAction<T extends Action<any, any, any>> =
    GetActionPayload<T> extends undefined
        ? () => Promise<GetActionResponse<T>>
        : (data: GetActionPayload<T>) => Promise<GetActionResponse<T>>

export interface ActionsMap {
    register: RegisterAction
    dial: DialAction
    wait: WaitAction
    playSound: PlaySoundAction
    answer: AnswerAction
    hold: HoldAction
    unhold: UnholdAction
    hangup: HangupAction
    sendDTMF: SendDTMFAction
    transfer: TransferAction
    unregister: UnregisterAction
    request: RequestAction
    DND: DNDAction
}

export type ActionsExecutorImplements = {
    [K in keyof ActionsMap]: ActionExecutorAction<ActionsMap[K]>
}

export type ActionsScenariosBuilderImplements = {
    [K in keyof ActionsMap]: (data: GetActionData<ActionsMap[K]>) => GetActionDefinition<ActionsMap[K]>
}

export type ActionsResponseMap = {
    [K in keyof ActionsMap]: GetActionResponse<ActionsMap[K]>
}

export type ActionType = keyof ActionsMap
export type ActionByActionType<T extends ActionType> = T extends keyof ActionsMap ? ActionsMap[T] : never

// Type guards for runtime type checking
export function isActionSuccess<T extends BaseActionSuccessResponse> (
    response: ActionResponse<T>
): response is T {
    return response.success === true
}

export function isActionError<T extends BaseActionSuccessResponse> (
    response: ActionResponse<T>
): response is ActionErrorResponse {
    return response.success === false
}
