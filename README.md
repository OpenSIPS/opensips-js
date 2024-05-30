# Getting started
## Installation
Using npm:
```shell
$ npm i @voicenter-team/opensips-js
```

## Usage
Firstly lets import the library and create the OpenSIPS instance:
```javascript
import OpenSIPSJS from '@voicenter-team/opensips-js'

const openSIPSJS = new OpenSIPSJS({
    configuration: {
        session_timers: false,
        uri: 'sip:extension_user@domain',
        // --- Use password or authorization_jwt to authorize
        password: 'password',
        // or
        authorization_jwt: 'token',
    },
    socketInterfaces: [ 'wss://domain' ],
    pnExtraHeaders: {
        'pn-provider': 'acme',
        'pn-param': 'acme-param',
        'pn-prid': 'ZH11Y4ZDJlMNzODE1NgKi0K>'
    },
    sipDomain: 'domain',
    sipOptions: {
        session_timers: false,
        extraHeaders: [ 'X-Bar: bar' ],
        pcConfig: {},
    },
    modules: [ 'audio', 'video', 'msrp' ]
})
```

Then you can work with appropriate modules:
```javascript
openSIPSJS.audio
openSIPSJS.video
openSIPSJS.msrp
```

# OpensipsJS
### OpensipsJS instance methods
- `begin(): OpensipsInstance` - start opensips
- `on(event: OpensipsEvent, callback): void` - remove event listener
- `subscribe({type: String, listener: function}): void` - subscribe to an event. Available events: `new_call`, `ended`, `progress`, `failed`, `confirmed`
- `removeIListener(type: String): void` - remove event listener

### OpensipsJS events

| Event      | Callback interface    | Description |
|----------------|---------|---------------|
| `ready` | `() => {}`  |   Emitted when opensips is initialized   |
| `changeActiveCalls`   | `(calls: { [key: string]: ICall }) => {}`  |  Emitted when active calls are changed  |
| `callAddingInProgressChanged`   | `(callId: string / undefined) => {}`  |  Emitted when any call adding state is changed  |
| `changeAvailableDeviceList`   | `(devices: Array<MediaDeviceInfo>) => {}`  |  Emitted when the list of available devices is changed  |
| `changeActiveInputMediaDevice`   | `(deviceId: string) => {}`  |  Emitted when active input device is changed |
| `changeActiveOutputMediaDevice`   | `(deviceId: string) => {}`  |  Emitted when active output device is changed  |
| `changeMuteWhenJoin`   | `(value: boolean) => {}`  |  Emitted when mute on join value is changed  |
| `changeIsDND`   | `(value: boolean) => {}`  |  Emitted when is DND value is changed  |
| `changeIsMuted`   | `(value: boolean) => {}`  |  Emitted when mute value is changed  |
| `changeActiveStream`   | `(stream: MediaStream) => {}`  |  Emitted when active stream was changed  |
| `changeCallVolume`   | `(callId: string, volume: number) => {}`  |  Emits the volume meter's value for each participant   |
| `currentActiveRoomChanged`   | `(number / undefined) => {}`  |  Emitted when active room is changed  |
| `addRoom`   | `({room: IRoom, roomList: {[id: number]: IRoom}}) => {}`  |  Emitted when new room was added  |
| `updateRoom`   | `({room: IRoom, roomList: {[id: number]: IRoom}}) => {}`  |  Emitted when room was updated  |
| `removeRoom`   | `({room: IRoom, roomList: {[p: number]: IRoom}}) => {}`  |  Emitted when room was deleted  |

WebrtcMetricsConfigType

| Parameter      | Type      | Default |
|----------------|-----------|----------|
| `refreshEvery` | `number` | `undefined`  |
| `startAfter`   | `number` | `undefined`  |
| `startAfter`   | `number` | `undefined`  |
| `verbose`      | `boolean` | `undefined` |
| `pname`        | `string` | `undefined`  |
| `cid`          | `string` | `undefined`  |
| `uid`          | `string` | `undefined`  |
| `record`       | `boolean` | `undefined` |
| `ticket`       | `boolean` | `undefined` |

Also, there are next public fields on OpensipsJS instance:
### OpensipsJS instance fields
- `sipDomain: String` - returns sip domain

# Audio

### Audio methods
- `initCall(target: String, addToCurrentRoom: Boolean): void` - call to the target. If addToCurrentRoom is true then the call will be added to the user's current room
- `holdCall(callId: String, automatic?: Boolean): Promise<void>` - put call on hold
- `unholdCall(callId: String): Promise<void>` - unhold a call
- `terminateCall(callId: String): void` - terminate call
- `moveCall(callId: String, roomId: Number): Promise<void>` - Same as callChangeRoom. Move call to the specific room
- `transferCall(callId: String, target: String): void` - transfer call to target
- `mergeCall(roomId: Number): void` - merge calls in specific room. Works only for rooms with 2 calls inside
- `answerCall(callId: String): void` - answer a call
- `mute(): void` - mute ourself
- `unmute(): void` - unmute ourself
- `muteCaller(callId: String): void` - mute caller
- `unmuteCaller(callId: String): void` - unmute caller
- `setMicrophone(deviceId: String): Promise<void>` - set passed device as input device for calls
- `setSpeaker(deviceId: String): Promise<void>` - set passed device as output device for calls
- `setActiveRoom(roomId: Number): Promise<void>` - switch to the room
- `setMicrophoneSensitivity(value: Number): void` - set sensitivity of microphone. Value should be in range from 0 to 1
- `setSpeakerVolume(value: Number): void` - set volume of callers. Value should be in range from 0 to 1
- `setDND(value: Boolean): void` - set the agent "Do not disturb" status
- `setMetricsConfig(config: WebrtcMetricsConfigType): void` - set the metric config (used for audio quality indicator)

### Audio instance fields
- `sipOptions: Object` - returns sip options
- `getActiveRooms: { [key: number]: IRoom }` - returns an object of active rooms where key is room id and value is room data
- `sipDomain: String` - returns sip domain
- `sipOptions: Object` - returns sip options
- `getInputDeviceList: []` - returns list of input devices
- `getOutputDeviceList: []` - returns list of output devices
- `currentActiveRoomId: Number` - returns current active room id
- `selectedInputDevice: String` - returns current selected input device id
- `selectedOutputDevice: String` - returns current selected output device id
- `isDND: Boolean` - returns if the agent is in "Do not disturb" status
- `isMuted: Boolean` - returns if the agent is muted

# MSRP

### MSRP methods
- `initMSRP(target: String, body: String): void` - initialize connection with target contact. Body is the initial message to this target.
- `sendMSRP(sessionId: String, body: String): Promise<void>` - send message
- `msrpAnswer(sessionId: String)` - accept MSRP session invitation
- `messageTerminate(sessionId: String)` - terminate message session

### MSRP instance fields
- `getActiveMessages: { [key: string]: IMessage }` - returns an object of active message sessions where key is session id and value is message session data.


# Video

### Video methods
- `joinRoom(roomId: String, displayName: String, mediaConstraints: Object): void` - join conference room
- `hangup()` - exit room
- `startVideo()` - turn on camera
- `stopVideo()` - turn off camera
- `startAudio()` - mute
- `stopAudio()` - unmute
- `startScreenShare()` - start screen sharing
- `stopScreenShare()` - stop screen sharing
- `enableScreenShareWhiteboard(enable: boolean, stream: MediaStream)` - enable screen share whiteboard. stream parameter is screen share stream
- `enableBokehEffectMask(): Promise<MediaStream>` - enable bokeh mask effect
- `enableBackgroundImgEffectMask(): Promise<MediaStream>` - enable background image mask effect
- `disableMask(): Promise<MediaStream>` - turn off mask effect. Returns stream without masking
- `restartMasking(): Promise<void>` - rerun mask effect
- `setupMaskVisualizationConfig(config: VisualizationConfigType)` - setup mask config
- `startNoiseFilter()` - start noise filter
- `stopNoiseFilter()` - stop noise filter
- `setBitrate(bitrate: number)` - set bitrate for video
- `enableWhiteboard(mode: 'whiteboard' | 'imageWhiteboard', enable: boolean, base64Image?: string)` - enable whiteboard. if mode is 'imageWhiteboard' then third parameter base64Image is required
- `setupDrawerOptions(options: KonvaDrawerOptions)` - setup option for drawer
- `setupScreenShareDrawerOptions(options: KonvaScreenShareDrawerOptions)` - setup option for screen share drawer

VisualizationConfigType

| Parameter      | Type                   | Default |
|----------------|------------------------|---------|
| `foregroundThreshold` | `number` | `0.5`  |
| `maskOpacity`   | `number`| `0.5`  |
| `maskBlur`   | `number`| `0`  |
| `pixelCellWidth`      | `number`| `10` |
| `backgroundBlur`        | `number`| `15`  |
| `edgeBlur`          | `number`| `3`  |

KonvaDrawerOptions

| Parameter      | Type      |
|----------------|-----------|
| `container` | `number` |
| `width`   | `number` |
| `height`   | `number` |

KonvaScreenShareDrawerOptions

| Parameter      | Type      |
|----------------|-----------|
| `strokeWidth` | `number` |
| `strokeColor`   | `string` |

### Video events

| Event      | Callback interface    | Description |
|----------------|---------|---------------|
| `member:join` | `(data) => {}`  |   Emitted when new member is joined   |
| `member:update`   | `(data) => {}`  |  Emitted when member data is changed  |
| `member:hangup`   | `(data) => {}`  |  Emitted when member leaves the conference  |
| `hangup`   | `() => {}`  |  Emitted when we leave the conference  |
| `screenShare:start`   | `() => {}`  |  Emitted when we share a screen  |
| `screenShare:stop`   | `() => {}`  |  Emitted when we stop a screen sharing  |
| `reconnect`   | `() => {}`  |  Emitted when reconnecting  |
| `mediaConstraintsChange`   | `() => {}`  |  Emitted when media constraints change |
| `metrics:report`   | `() => {}`  |  Emitted on metric report |
| `metrics:stop`   | `() => {}`  |  Emitted when metrics are stopped |
