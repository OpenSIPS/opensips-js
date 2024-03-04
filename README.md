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
        password: 'password',
    },
    socketInterfaces: [ 'wss://domain' ],
    sipDomain: 'domain',
    sipOptions: {
        session_timers: false,
        extraHeaders: [ 'X-Bar: bar' ],
        pcConfig: {},
    },
})
```

Then you will be able to call next methods on openSIPSJS instance:

### Methods
- `begin(): OpensipsInstance` - start opensips
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
- `subscribe({type: String, listener: function}): void` - subscribe to an event. Available events: `new_call`, `ended`, `progress`, `failed`, `confirmed`
- `removeIListener(type: String): void` - remove event listener
- `on(event: OpensipsEvent, callback): void` - remove event listener
- `setMetricsConfig(config: WebrtcMetricsConfigType): void` - set the metric config (used for audio quality indicator)

### Opensips Events

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

| Parameter      | Type                   |
|----------------|------------------------|
| `refreshEvery` | `number \| undefined`  |
| `startAfter`   | `number \| undefined`  |
| `startAfter`   | `number \| undefined`  |
| `verbose`      | `boolean \| undefined` |
| `pname`        | `string \| undefined`  |
| `cid`          | `string \| undefined`  |
| `uid`          | `string \| undefined`  |
| `record`       | `boolean \| undefined` |
| `ticket`       | `boolean \| undefined` |

Also there are next public fields on openSIPSJS instance:
### Fields
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
