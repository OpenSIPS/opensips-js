import OpenSIPSJS, { IRoom } from '../src/index'
import { RTCSessionEvent } from 'jssip/lib/UA'
import { ICall, RoomChangeEmitType } from '../src/types/rtc'
import { runIndicator } from '../src/helpers/volume.helper'

let openSIPSJS = null
let addCallToCurrentRoom = false

/* DOM Elements */

const loginToAppFormEl = document.getElementById('loginToAppForm')
const loginPageEl = document.getElementById('loginPage')
const webRTCPageEl = document.getElementById('webRTCPage')

const makeCallFormEl = document.getElementById('makeCallForm')
const callAddingIndicatorEl = document.getElementById('callAddingIndicator')

const microphoneEl = document.getElementById('microphoneEl') as HTMLSelectElement
const speakerEl = document.getElementById('speakerEl') as HTMLSelectElement

const muteWhenJoinInputEl = document.getElementById('muteWhenJoinInputEl') as HTMLInputElement
const DNDInputEl = document.getElementById('DNDInputEl') as HTMLInputElement
const muteContainerEl = document.getElementById('muteContainerEl') as HTMLElement

const addToCurrentRoomInputEl = document.getElementById('addToCurrentRoomInputEl') as HTMLInputElement

const inputLevelApplyButtonEl = document.getElementById('inputLevelApplyButton') as HTMLButtonElement
const outputLevelApplyButtonEl = document.getElementById('outputLevelApplyButton') as HTMLButtonElement
const inputLevelEl = document.getElementById('inputLevel') as HTMLInputElement
const outputLevelEl = document.getElementById('outputLevel') as HTMLInputElement

const dtmfForm = document.getElementById('dtmfForm') as HTMLFormElement
const dtmfInputEl = document.getElementById('dtmfInput') as HTMLInputElement
const dtmfSendButtonEl = document.getElementById('dtmfSendButton') as HTMLButtonElement

const agentVoiceLevelContainerEl = document.getElementById('agentVoiceLevelContainer')

const activeCallsCounterEl = document.getElementById('activeCallsCounter')
const roomSelectEl = document.getElementById('roomSelect') as HTMLSelectElement

const roomsContainerEl = document.getElementById('roomsContainer')

/* Helpers */

const muteButtonEventListener = (event: MouseEvent) => {
    event.preventDefault()
    openSIPSJS.doMute(!openSIPSJS.isMuted)
}

const calculateDtmfButtonDisability = (sessions: { [key: string]: ICall }) => {
    const callsInActiveRoom = Object.values(sessions).filter((call) => call.roomId === openSIPSJS.currentActiveRoomId)
    const dtmfTarget = dtmfInputEl.value

    if (callsInActiveRoom.length !== 1 || !dtmfTarget) {
        dtmfSendButtonEl.setAttribute('disabled', 'true')
    } else {
        dtmfSendButtonEl.removeAttribute('disabled')
    }
}

const calculateMuteButtonDisability = (sessions: { [key: string]: ICall }) => {
    if (!muteContainerEl) {
        return
    }

    if (!Object.keys(sessions).length) {
        muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
    } else {
        muteContainerEl.querySelector('button').removeAttribute('disabled')
    }
}

const calculateVolumeLevel = (sessions: { [key: string]: ICall }) => {
    const volumeContainer = document.getElementById('volume-level-agent-voice-level')

    if (!Object.keys(sessions).length && volumeContainer) {
        if (volumeContainer) {
            volumeContainer.remove()
        }
    }

    if (!volumeContainer) {
        const spanEl = document.createElement('span')
        spanEl.setAttribute('id', 'volume-level-agent-voice-level')
        spanEl.classList.add('volume-wrapper')

        const canvasEl = document.createElement('canvas')
        canvasEl.setAttribute('id', 'canvas-agent-voice-level')
        canvasEl.width = 20
        canvasEl.height = 20
        spanEl.appendChild(canvasEl)

        agentVoiceLevelContainerEl.appendChild(spanEl)
        //runIndicator()
    }
}

const calculateActiveCallsNumber = (sessions: { [key: string]: ICall }) => {
    const counter = Object.keys(sessions).length
    activeCallsCounterEl.innerText = `${counter}`
}

const updateRoomListOptions = (roomList: { [key: number]: IRoom }) => {
    const currentSelectedRoom = openSIPSJS.currentActiveRoomId

    roomSelectEl.querySelectorAll('option:not(.noData)').forEach(el => el.remove())

    roomsContainerEl.querySelectorAll('.roomWrapper').forEach(el => el.remove())

    Object.values(roomList).forEach((room) => {
        // Update room Select options
        const newOption = document.createElement('option') as HTMLOptionElement
        newOption.value = `${room.roomId}`
        newOption.text = `Room ${room.roomId}`
        newOption.setAttribute('key', `${room.roomId}`)

        if (room.roomId === currentSelectedRoom) {
            newOption.setAttribute('selected', '')
        }

        roomSelectEl.appendChild(newOption)

        // Update all call move to room select options

        // Update rooms list data
        const roomEl = document.createElement('div')
        roomEl.setAttribute('id', `room-${room.roomId}`)
        roomEl.setAttribute('key', `${room.roomId}`)
        roomEl.classList.add('roomWrapper')

        const roomInfoEl = document.createElement('div')
        const roomNameEl = document.createElement('b')
        const roomDateEl = document.createElement('span')
        roomNameEl.innerText = `Room ${room.roomId} - `
        roomDateEl.innerText = `${room.started}`
        roomInfoEl.appendChild(roomNameEl)
        roomInfoEl.appendChild(roomDateEl)
        roomEl.appendChild(roomInfoEl)

        const breakEl = document.createElement('br')
        roomEl.appendChild(breakEl)

        const unorderedListEl = document.createElement('ul')
        roomEl.appendChild(unorderedListEl)

        roomsContainerEl.appendChild(roomEl)

        upsertRoomData(room, openSIPSJS.getActiveCalls)
    })
}

const upsertRoomData = (room: IRoom, sessions: {[p: string]: ICall}) => {
    const ulListEl = roomsContainerEl.querySelector(`#room-${room.roomId} ul`)
    ulListEl.querySelectorAll('li').forEach(el => el.remove())

    const activeCallsInRoom = Object.values(sessions).filter((call) => call.roomId === room.roomId)
    activeCallsInRoom.forEach((call, index) => {
        const listItemEl = document.createElement('li')
        listItemEl.setAttribute('key', `${index}`)

        const callIdListItem = document.createElement('div')
        callIdListItem.innerText = call._id
        listItemEl.appendChild(callIdListItem)


        const muteAgentButtonEl = document.createElement('button') as HTMLButtonElement
        muteAgentButtonEl.innerText = call.localMuted ? 'Unmute' : 'Mute'
        muteAgentButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            const isMuted = call.localMuted
            openSIPSJS.muteCaller(call._id, !isMuted)
            muteAgentButtonEl.innerText = !isMuted ? 'Unmute' : 'Mute'
        })
        listItemEl.appendChild(muteAgentButtonEl)


        const terminateButtonEl = document.createElement('button') as HTMLButtonElement
        terminateButtonEl.innerText = 'Hangup'
        terminateButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            openSIPSJS.callTerminate(call._id)
        })
        listItemEl.appendChild(terminateButtonEl)


        const transferButtonEl = document.createElement('button') as HTMLButtonElement
        transferButtonEl.innerText = 'Transfer'
        transferButtonEl.addEventListener('click', (event) => {
            event.preventDefault()

            const target = prompt('Please enter target:')

            if (target !== null || target !== '') {
                openSIPSJS.callTransfer(call._id, target)
            }
        })
        listItemEl.appendChild(transferButtonEl)


        if (activeCallsInRoom.length === 2) {
            const mergeButtonEl = document.createElement('button') as HTMLButtonElement
            mergeButtonEl.innerText = `Merge ${room.roomId}`
            mergeButtonEl.addEventListener('click', (event) => {
                event.preventDefault()
                openSIPSJS.callMerge(room.roomId)
            })
            listItemEl.appendChild(mergeButtonEl)
        }


        const holdAgentButtonEl = document.createElement('button') as HTMLButtonElement
        holdAgentButtonEl.innerText = call._localHold ? 'UnHold' : 'Hold'
        holdAgentButtonEl.classList.add('holdAgent')
        let isOnHold = call._localHold
        holdAgentButtonEl.addEventListener('click', (event) => {
            event.preventDefault()
            openSIPSJS.doCallHold({ callId: call._id, toHold: !isOnHold })
            holdAgentButtonEl.innerText = !isOnHold ? 'UnHold' : 'Hold'
            isOnHold = !isOnHold
        })
        listItemEl.appendChild(holdAgentButtonEl)

        if (call.direction !== 'outgoing' && !call._is_confirmed) {
            const answerButtonEl = document.createElement('button') as HTMLButtonElement
            answerButtonEl.innerText = 'Answer'
            answerButtonEl.addEventListener('click', (event) => {
                event.preventDefault()
                openSIPSJS.callAnswer(call._id)
            })
            listItemEl.appendChild(answerButtonEl)
        }


        /* New functional */
        const callMoveSelectEl = document.createElement('select') as HTMLSelectElement

        const currentRoomMoveOption = document.createElement('option')
        currentRoomMoveOption.value = String(call.roomId)
        currentRoomMoveOption.text = `Room ${call.roomId}`
        callMoveSelectEl.appendChild(currentRoomMoveOption)

        Object.values(openSIPSJS.getActiveRooms).forEach((room: IRoom) => {
            if (call.roomId === room.roomId) {
                return
            }

            const roomMoveOption = document.createElement('option')
            roomMoveOption.value = String(room.roomId)
            roomMoveOption.text = `Room ${room.roomId}`
            callMoveSelectEl.appendChild(roomMoveOption)
        })

        callMoveSelectEl.addEventListener('change', (event) => {
            event.preventDefault()

            const target = event.target as HTMLSelectElement
            openSIPSJS.callMove(call._id, parseInt(target.value))
        })
        listItemEl.appendChild(callMoveSelectEl)

        ulListEl.appendChild(listItemEl)
    })
}

/* DOMContentLoaded Listener */

window.addEventListener('DOMContentLoaded', () => {
    if (muteContainerEl) {
        muteContainerEl.querySelector('button').addEventListener('click', muteButtonEventListener)
    }

    if (addToCurrentRoomInputEl) {
        addToCurrentRoomInputEl.addEventListener(
            'change',
            async (event) => {
                event.preventDefault()

                const target = event.target as HTMLInputElement
                addCallToCurrentRoom = target.checked
            })
    }
})

/* DOM Elements Listeners */

loginToAppFormEl?.addEventListener('submit', (event) => {
    event.preventDefault()

    const form = event.target
    if (!(form instanceof HTMLFormElement)) {
        return
    }

    const formData = new FormData(form)

    const username = formData.get('username')
    const password = formData.get('password')
    const domain = formData.get('domain')

    if (!username || !password || !domain) {
        alert('Fill up all required fields')
        return
    }

    try {
        openSIPSJS = new OpenSIPSJS({
            configuration: {
                session_timers: false,
                uri: `sip:${username}@${domain}`,
                password: password
            },
            socketInterfaces: [ `wss://${domain}` ],
            sipDomain: `${domain}`,
            sipOptions: {
                session_timers: false,
                extraHeaders: [ 'X-Bar: bar' ],
                pcConfig: {},
            },
        })

        /* openSIPSJS Listeners */
        openSIPSJS
            .on('ready', () => {
                if (!muteContainerEl) {
                    return
                }

                muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
                addToCurrentRoomInputEl.checked = false
            })
            .on('changeActiveCalls', (sessions) => {
                calculateDtmfButtonDisability(sessions)
                calculateMuteButtonDisability(sessions)
                calculateVolumeLevel(sessions)
                calculateActiveCallsNumber(sessions)

                Object.values(openSIPSJS.getActiveRooms).forEach((room: IRoom) => {
                    upsertRoomData(room, sessions)
                })
            })
            .on('newRTCSession', ({ session }: RTCSessionEvent) => {
                console.warn('e', session)
            })
            .on('callAddingInProgressChanged', (value) => {
                if (!callAddingIndicatorEl) {
                    return
                }

                if (value === undefined) {
                    callAddingIndicatorEl.classList.add('hidden')
                    makeCallFormEl?.querySelector('button[type="submit"]').removeAttribute('disabled')
                } else {
                    callAddingIndicatorEl.classList.remove('hidden')
                    makeCallFormEl?.querySelector('button[type="submit"]').setAttribute('disabled', 'true')
                }
            })
            .on('changeAvailableDeviceList', (devices: Array<MediaDeviceInfo>) => {
                const inputDevices = devices.filter(d => d.kind === 'audioinput')
                const outputDevices = devices.filter(d => d.kind === 'audiooutput')

                // Update microphone device options list
                if (microphoneEl) {
                    while (microphoneEl.childNodes.length >= 1) {
                        microphoneEl.removeChild(microphoneEl.firstChild)
                    }

                    inputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        microphoneEl.appendChild(newOption)
                    })
                }

                // Update speaker device options list
                if (speakerEl) {
                    while (speakerEl.childNodes.length >= 1) {
                        speakerEl.removeChild(speakerEl.firstChild)
                    }

                    outputDevices.forEach((d) => {
                        const newOption = document.createElement('option')
                        newOption.value = d.deviceId
                        newOption.text = d.label
                        speakerEl.appendChild(newOption)
                    })
                }
            })
            .on('changeActiveInputMediaDevice', (data: string) => {
                if (microphoneEl) {
                    microphoneEl.value = data
                }
            })
            .on('changeActiveOutputMediaDevice', (data: string) => {
                if (speakerEl) {
                    speakerEl.value = data
                }
            })
            .on('changeMuteWhenJoin', (value: boolean) => {
                if (muteWhenJoinInputEl) {
                    muteWhenJoinInputEl.checked = value
                }
            })
            .on('changeIsDND', (value: boolean) => {
                if (DNDInputEl) {
                    DNDInputEl.checked = value
                }
            })
            .on('changeIsMuted', (value: boolean) => {
                if (!muteContainerEl) {
                    return
                }

                muteContainerEl.removeChild(muteContainerEl.querySelector('button'))
                const buttonEl = document.createElement('button') as HTMLButtonElement
                const buttonText = value ? 'Unmute' : 'Mute'
                buttonEl.classList.add('muteButtonEl')
                buttonEl.innerText = buttonText
                buttonEl.addEventListener('click', muteButtonEventListener)
                muteContainerEl.appendChild(buttonEl)
            })
            .on('changeOriginalStream', (value: MediaStream) => {
                runIndicator(value, 'agent-voice-level')
            })
            .on('currentActiveRoomChanged', (id: number | undefined) => {
                roomsContainerEl.querySelectorAll('.roomWrapper').forEach((el) => {
                    const elRoomId = +el.id.split('-')[1]
                    el.querySelectorAll('.holdAgent').forEach((btnEl) => {
                        if (elRoomId === id) {
                            btnEl.removeAttribute('disabled')
                        } else {
                            btnEl.setAttribute('disabled', '')
                        }
                    })
                })

                const options = roomSelectEl.querySelectorAll('option')
                options.forEach(option => option.removeAttribute('selected'))

                if (!id) {
                    const noDataOption = roomSelectEl.querySelector('option.noData')
                    noDataOption.setAttribute('selected', '')
                    return
                }

                options.forEach(option => {
                    if (option.value === `${id}`) {
                        option.setAttribute('selected', '')
                    }
                })
            })
            .on('addRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .on('updateRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .on('removeRoom', ({ roomList }: RoomChangeEmitType) => {
                updateRoomListOptions(roomList)
            })
            .start()

        loginPageEl.style.display = 'none'
        webRTCPageEl.style.display = 'block'
    } catch (e) {
        console.error(e)
    }
})

makeCallFormEl?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()

        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const formData = new FormData(form)
        const target = formData.get('target')

        if (typeof target !== 'string' || target.length === 0) {
            alert('Please provide a valid string!')

            return
        }

        openSIPSJS.doCall({
            target,
            addToCurrentRoom: addCallToCurrentRoom
        })
    }
)

microphoneEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        await openSIPSJS.setMicrophone(target.value)
    })

speakerEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        await openSIPSJS.setSpeaker(target.value)
    })

muteWhenJoinInputEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLInputElement
        openSIPSJS.muteWhenJoin = target.checked

    })

DNDInputEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLInputElement
        openSIPSJS.isDND = target.checked

    })

inputLevelApplyButtonEl?.addEventListener(
    'click',
    async (event) => {
        event.preventDefault()

        const value = Number(inputLevelEl.value)
        openSIPSJS.microphoneInputLevel = value
    })

outputLevelApplyButtonEl?.addEventListener(
    'click',
    async (event) => {
        event.preventDefault()

        const value = Number(outputLevelEl.value)
        openSIPSJS.speakerVolume = value
    })


dtmfInputEl?.addEventListener(
    'input',
    async (event) => {
        event.preventDefault()

        calculateDtmfButtonDisability(openSIPSJS.getActiveCalls)
    })

dtmfForm?.addEventListener(
    'submit',
    (event) => {
        event.preventDefault()
        const form = event.target

        if (!(form instanceof HTMLFormElement)) {
            return
        }

        const callsInActiveRoom = (Object.values(openSIPSJS.getActiveCalls) as Array<ICall>).filter((call) => call.roomId === openSIPSJS.currentActiveRoomId)
        const dtmfTarget = dtmfInputEl.value

        openSIPSJS.sendDTMF(callsInActiveRoom[0].id, dtmfTarget)
    })

roomSelectEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        const parsedValue = parseInt(target.value)
        const roomId = isNaN(parsedValue) ? undefined: parsedValue
        await openSIPSJS.setCurrentActiveRoomId(roomId)
    })