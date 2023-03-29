import OpenSIPSJS from '../src'
import { RTCSessionEvent } from 'jssip/lib/UA'

const openSIPSJS = new OpenSIPSJS({
    configuration: {
        session_timers: false,
        uri: 'sip:hot9LF30@sip06.voicenter.co:8888',
        password: 'FPQV3alO1eattCmH',
    },
    socketInterfaces: [ 'wss://sip06.voicenter.co:8888' ],
    sipDomain: 'sip06.voicenter.co',
    sipOptions: {
        session_timers: false,
        extraHeaders: [ 'X-Bar: bar' ],
        pcConfig: {},
    },
})

openSIPSJS
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
        } else {
            callAddingIndicatorEl.classList.remove('hidden')
        }
    })
    .start()

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
            addToCurrentRoom: false
        })
    }
)
