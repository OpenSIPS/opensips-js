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
- `initCall(target: String, addToCurrentRoom: Boolean): void` - call to the target. If addToCurrentRoom is true then the call will be added to the user's current room
- `holdCall(callId: String, automatic?: Boolean): Promise<void>` - put call on hold
- `unholdCall(callId: String): Promise<void>` - unhold a call
- `terminateCall(callId: String): void` - terminate call
- `moveCall({callId: String, roomId: Number}): Promise<void>` - Same as callChangeRoom. Move call to the specific room
- `transferCall({callId: String, target: String}): void` - transfer call to target
- `mergeCall(roomId: Number): void` - merge calls in specific room. Works only for rooms with 2 calls inside
- `answerCall(callId: String): void` - answer a call
- `mute(): void` - mute ourself
- `unmute(): void` - unmute ourself
- `muteCaller(callId: String): void` - mute caller
- `unmuteCaller(callId: String): void` - unmute caller
- `setMicrophone(deviceId: String): Promise<void>` - set passed device as input device for calls
- `setSpeaker(deviceId: String): Promise<void>` - set passed device as output device for calls
- `setActiveRoom(roomId: Number): Promise<void>` - switch to the room
- `setMicrophoneSensitivity(value: Number): void` - set sensitivity of microphone
- `setDND(value: Boolean): void` - set the agent "Do not disturb" status
- `subscribe({type: String, listener: function}): void` - subscribe to an event. Available events: `new_call`, `ended`, `progress`, `failed`, `confirmed`
- `removeIListener(type: String): void` - remove event listener
- `setMetricsConfig(config: WebrtcMetricsConfigType): void` - set the metric config (used for audio quality indicator)

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
