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
- `async setMediaDevices(setDefaults: Boolean = false)` - will set up media devices
- `async setMicrophone(deviceId: String)` - set passed device as input device for calls
- `async setSpeaker(deviceId: String)` - set passed device as output device for calls
- `async setCurrentActiveRoomId(roomId: Number)` - move to the room
- `doCallHold({callId: Number, toHold: Boolean, automatic: Boolean})` - hold/unhold call by id
- `doCall(target: String, addToCurrentRoom: Boolean)` - call to the target. If addToCurrentRoom is true then the call will be added to the user's current room
- `callTerminate(callId: String)` - terminate call
- `callTransfer({callId: String, target: String})` - transfer call to target
- `callMerge(roomId: Number)` - merge calls in specific room
- `callAnswer(callId: String)` - answer the call
- `setMetricsConfig(config: WebrtcMetricsConfigType)` - set the metric config (used for audio quality indicator)
- `doMute(muted: Boolean)` - set the agent muteness
- `setDND(value: Boolean)` - set the agent "Do not disturb" status
- `async callChangeRoom({callId: String, roomId: Number})` - move call to the room
- `callMove({callId: String, roomId: Number})` - Same as callChangeRoom. Move call to the specific room
- `subscribe({type: String, listener: function})` - subscribe to an event. Available events: `new_call`, `ended`, `progress`, `failed`, `confirmed`
- `removeIListener(type: String)` - remove event listener

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