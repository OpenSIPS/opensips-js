class DeviceManager {
    static canGetMediaDevices () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            return false
        }
        return true
    }

    private static async getDevices (kind: string) {
        if (!DeviceManager.canGetMediaDevices()) {
            return []
        }
        const devices = await navigator.mediaDevices.enumerateDevices()
        return devices.filter(device => device.kind === kind)
    }

    static async getMicrophoneList (): Promise<MediaDeviceInfo[]> {
        const devices: MediaDeviceInfo[] = await DeviceManager.getDevices('audioinput')

        return devices.map((device, index) => {
            return {
                ...device,
                deviceId: device.deviceId,
                label: device.label || `microphone ${index + 1}`,
                kind: device.kind,
                groupId: device.groupId
            }
        })
    }

    static async getSpeakerList (): Promise<MediaDeviceInfo[]> {
        const devices: MediaDeviceInfo[] = await DeviceManager.getDevices('audiooutput')

        return devices.map((device, index) => {
            return {
                ...device,
                deviceId: device.deviceId,
                label: device.label || `speaker ${index + 1}`,
                kind: device.kind,
                groupId: device.groupId
            }
        })
    }

    static async getCameraList () {
        const devices: MediaDeviceInfo[] = await DeviceManager.getDevices('videoinput')

        return devices.map((device, index) => {
            return {
                ...device,
                deviceId: device.deviceId,
                label: device.label || `camera ${index + 1}`,
                kind: device.kind,
                groupId: device.groupId
            }
        })
    }

    static stopStreamTracks (stream: MediaStream) {
        if (!stream) {
            return
        }
        stream.getTracks().forEach(track => {
            track.stop()
        })
    }

    static async getMediaFromInputs ({ videoInput, audioInput }) {
        let video = undefined
        let audio = undefined
        if (videoInput === 'default') {
            video = true
        } else if (videoInput && videoInput !== 'default') {
            video = {
                deviceId: {
                    exact: videoInput
                }
            }
        }
        if (audioInput === 'default') {
            audio = true
        } else if (audioInput && audioInput !== 'default') {
            audio = {
                deviceId: {
                    exact: audioInput
                }
            }
        }
        const constraints = {
            audio,
            video,
        }
        return DeviceManager.getUserMedia(constraints)
    }

    static async getUserMedia (constraints: any) {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        return stream
    }

    static async changeAudioOutput (element: any, deviceId: string) {
        if (!element || !deviceId) {
            return
        }

        if (typeof element.sinkId !== 'undefined') {
            try {
                await element.setSinkId(deviceId)
            } catch (error) {
                let errorMessage = error
                if (error.name === 'SecurityError') {
                    errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`
                }
                console.error(errorMessage)
            }
        } else {
            console.warn('Browser does not support output device selection.')
        }
    }

    static toggleAudioMute (stream) {
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0) {
            return
        }

        audioTracks.forEach(track => {
            track.enabled = !track.enabled
        })

        return audioTracks[0].enabled
    }

    static toggleVideoMute (stream) {
        const videoTracks = stream.getVideoTracks()
        if (videoTracks.length === 0) {
            return
        }

        videoTracks.forEach(track => {
            track.enabled = !track.enabled
        })

        return videoTracks[0].enabled
    }

    static async getStream (streamOptions = {
        video: true,
        audio: true
    }) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(streamOptions)

            let tracks = stream.getTracks()
            if (streamOptions.video) {
                tracks = stream.getVideoTracks()
            } else if (streamOptions.audio) {
                tracks = stream.getAudioTracks()
            }
            if (tracks.length === 0) {
                return {
                    stream,
                    track: null
                }
            }
            return {
                stream,
                track: tracks[0]
            }
        } catch (err) {
            console.warn(err)
            return {
                stream: null,
                track: null,
            }
        }
    }
}

export default DeviceManager
