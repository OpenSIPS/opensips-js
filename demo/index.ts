import OpenSIPSJS from '../src'
import { RTCSessionEvent } from 'jssip/lib/UA'

const openSIPSJS = new OpenSIPSJS({
    configuration: {
        session_timers: false,
        uri: 'sip:hot9LF30@sip06.voicenter.co:8888',
        password: 'FPQV3alO1eattCmH',
    },
    socketInterfaces: [ 'wss://sip05.voicenter.co:8888' ],
    sipDomain: 'sip06.voicenter.co',
    sipOptions: {
        session_timers: false,
        extraHeaders: [ 'X-Bar: bar' ],
        pcConfig: {},
    },
})

let addCallToCurrentRoom = false

const microphoneEl = document.getElementById('microphoneEl') as HTMLSelectElement
const speakerEl = document.getElementById('speakerEl') as HTMLSelectElement

const muteWhenJoinInputEl = document.getElementById('muteWhenJoinInputEl') as HTMLInputElement
const DNDInputEl = document.getElementById('DNDInputEl') as HTMLInputElement
const muteContainerEl = document.getElementById('muteContainerEl') as HTMLElement

const addToCurrentRoomInputEl = document.getElementById('addToCurrentRoomInputEl') as HTMLInputElement

const muteButtonEventListener = (event: MouseEvent) => {
    event.preventDefault()
    openSIPSJS.doMute(!openSIPSJS.isMuted)
}

openSIPSJS
    .on('ready', () => {
        if (!muteContainerEl) {
            return
        }

        muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
        addToCurrentRoomInputEl.checked = false
    })
    .on('changeActiveCalls', (sessions) => {
        if (!muteContainerEl) {
            return
        }

        if (!Object.keys(sessions).length) {
            muteContainerEl.querySelector('button').setAttribute('disabled', 'true')
        } else {
            muteContainerEl.querySelector('button').removeAttribute('disabled')
        }
    })
    .on('newRTCSession', ({ session }: RTCSessionEvent) => {
        console.warn('e', session)
    })
    .on('callAddingInProgressChanged', (value) => {
        //console.log('callAddingInProgressChanged', value)
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
            while ( microphoneEl.childNodes.length >= 1 )
            {
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
            while ( speakerEl.childNodes.length >= 1 )
            {
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
    .start()

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

const makeCallFormEl = document.getElementById('makeCallForm')
const callAddingIndicatorEl = document.getElementById('callAddingIndicator')

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
        //console.log('event', target.value)
    })

speakerEl?.addEventListener(
    'change',
    async (event) => {
        event.preventDefault()

        const target = event.target as HTMLSelectElement
        await openSIPSJS.setSpeaker(target.value)
        //console.log('event', target.value)
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
