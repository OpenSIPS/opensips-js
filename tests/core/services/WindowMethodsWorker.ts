import { Page } from 'playwright'

export default class WindowMethodsWorker {
    private remoteCaptureBound = false

    constructor (
        private readonly page: Page
    ) {}

    public async implementPlayClipMethod (): Promise<void> {
        try {
            // Use string evaluation since TypeScript version doesn't work
            const initScript = `
                (function() {
                    console.log('=== INITIALIZING AUDIO SYSTEM FOR HEADLESS/SERVER ===');

                    // Create audio context
                    window.audioContext = new (window.AudioContext || window.webkitAudioContext)();

                    // Create the controllable stream destination
                    window.mediaStreamDestination = window.audioContext.createMediaStreamDestination();

                    // Create gain node with high volume
                    window.gainNode = window.audioContext.createGain();
                    window.gainNode.gain.value = 5.0;
                    window.gainNode.connect(window.mediaStreamDestination);

                    console.log('Audio nodes created - gain value:', window.gainNode.gain.value);

                    // Store original getUserMedia
                    window.originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

                    // Override getUserMedia to return our controllable stream
                    // This will work even on headless servers with no real audio devices
                    navigator.mediaDevices.getUserMedia = function(constraints) {
                        console.log('!!! getUserMedia INTERCEPTED:', constraints);

                        if (constraints && constraints.audio) {
                            console.log('!!! RETURNING FAKE CONTROLLABLE STREAM (works on headless servers)');

                            var stream = window.mediaStreamDestination.stream.clone();
                            console.log('Fake stream created with', stream.getAudioTracks().length, 'audio tracks');

                            return Promise.resolve(stream);
                        }

                        if (constraints && constraints.video) {
                            console.log('Video requested - using original getUserMedia');
                            return window.originalGetUserMedia.call(navigator.mediaDevices, constraints);
                        }

                        return window.originalGetUserMedia.call(navigator.mediaDevices, constraints);
                    };

                    // Also override enumerateDevices to show fake devices
                    window.originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

                    navigator.mediaDevices.enumerateDevices = function() {
                        console.log('!!! enumerateDevices INTERCEPTED - returning fake devices for headless compatibility');

                        return Promise.resolve([
                            {
                                deviceId: 'fake-audio-input-1',
                                groupId: 'fake-group-1',
                                kind: 'audioinput',
                                label: 'Fake Microphone (Test Audio Stream)'
                            },
                            {
                                deviceId: 'fake-audio-output-1',
                                groupId: 'fake-group-1',
                                kind: 'audiooutput',
                                label: 'Fake Speaker (Test Audio Output)'
                            }
                        ]);
                    };

                    window.audioSystemReady = true;
                    console.log('=== HEADLESS-COMPATIBLE AUDIO SYSTEM READY ===');
                })();
            `

            await this.page.evaluate(initScript)

        } catch (error) {
            throw error
        }
    }

    public async playClip (url: string): Promise<void> {
        try {
            // String evaluation to avoid transpilation issues
            const audioScript = `
                (function(audioUrl) {
                    console.log('=== PLAYING AUDIO FOR WEBRTC (HEADLESS COMPATIBLE) ===');

                    if (!window.audioSystemReady) {
                        throw new Error('Audio system not ready');
                    }

                    return new Promise(function(resolve, reject) {
                        try {
                            var audio = new Audio(audioUrl);
                            audio.volume = 1.0;

                            console.log('Audio element created (works without real audio hardware)');

                            var audioSource = null;
                            var settled = false;

                            function finish() {
                                if (settled) { return; }
                                settled = true;
                                if (audioSource) {
                                    try { audioSource.disconnect(); } catch (e) {}
                                }
                                if (window.__currentClipAudio === audio) {
                                    window.__currentClipAudio = null;
                                    window.__stopCurrentClip = null;
                                }
                                resolve();
                            }

                            // Allow the current TTS clip to be interrupted (barge-in).
                            window.__currentClipAudio = audio;
                            window.__stopCurrentClip = function() {
                                console.log('>>> AUDIO INTERRUPTED (barge-in) <<<');
                                try { audio.pause(); } catch (e) {}
                                finish();
                            };

                            function connectAudio() {
                                if (!audioSource && audio.readyState >= 1) {
                                    try {
                                        console.log('>>> CONNECTING AUDIO TO WEBRTC STREAM <<<');

                                        // This works even on headless servers
                                        audioSource = window.audioContext.createMediaElementSource(audio);
                                        audioSource.connect(window.gainNode);

                                        console.log('>>> AUDIO CONNECTED TO WEBRTC STREAM <<<');
                                        console.log('This works on headless servers without real audio devices');

                                    } catch (error) {
                                        console.error('Connection error:', error);
                                        reject(error);
                                    }
                                }
                            }

                            audio.addEventListener('loadedmetadata', function() {
                                console.log('Metadata loaded, duration:', audio.duration);
                                connectAudio();
                            });

                            audio.addEventListener('canplay', function() {
                                console.log('Can play');
                                connectAudio();
                            });

                            audio.addEventListener('playing', function() {
                                console.log('>>> AUDIO PLAYING TO WEBRTC STREAM <<<');
                            });

                            audio.addEventListener('ended', function() {
                                console.log('>>> AUDIO FINISHED <<<');
                                finish();
                            });

                            audio.addEventListener('error', function(e) {
                                console.error('Audio error:', e);
                                reject(new Error('Audio playback failed'));
                            });

                            // Set source and play
                            audio.src = audioUrl;
                            audio.load();

                            audio.play().then(function() {
                                console.log('Play started - routing to WebRTC (headless compatible)');
                                connectAudio();
                            }).catch(function(error) {
                                console.error('Play failed:', error);
                                reject(error);
                            });

                        } catch (error) {
                            console.error('Error:', error);
                            reject(error);
                        }
                    });
                })('${url.replace(/'/g, "\\'")}');
            `

            await this.page.evaluate(audioScript)

        } catch (error) {
            throw error
        }
    }

    /**
     * Capture the remote party's audio track and stream it to Node as base64
     * chunks. Relies on `window.__latestRemoteAudioStream` set in WebRTCMetricsCollector.
     */
    public async startRemoteAudioCapture (
        onChunk: (base64Chunk: string) => void | Promise<void>,
        timesliceMs = 250
    ): Promise<void> {
        if (!this.remoteCaptureBound) {
            await this.page.exposeFunction(
                '__onRemoteAudioChunk',
                (base64: string) => onChunk(base64)
            )
            this.remoteCaptureBound = true
        }

        const captureScript = `
            (function(timeslice) {
                if (!window.__latestRemoteAudioStream) {
                    throw new Error('No remote audio stream available yet. Start transcription after the call is connected.');
                }

                var mimeType = 'audio/webm;codecs=opus';
                if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = '';
                }

                var recorder = mimeType
                    ? new MediaRecorder(window.__latestRemoteAudioStream, { mimeType: mimeType })
                    : new MediaRecorder(window.__latestRemoteAudioStream);

                recorder.ondataavailable = function(event) {
                    if (!event.data || event.data.size === 0) {
                        return;
                    }
                    var reader = new FileReader();
                    reader.onloadend = function() {
                        var result = String(reader.result || '');
                        var base64 = result.indexOf(',') !== -1 ? result.split(',')[1] : '';
                        if (base64 && window.__onRemoteAudioChunk) {
                            window.__onRemoteAudioChunk(base64);
                        }
                    };
                    reader.readAsDataURL(event.data);
                };

                window.__remoteAudioRecorder = recorder;
                recorder.start(timeslice);
                console.log('=== REMOTE AUDIO CAPTURE STARTED ===');
            })(${timesliceMs});
        `

        await this.page.evaluate(captureScript)
    }

    public async stopRemoteAudioCapture (): Promise<void> {
        const stopScript = `
            (function() {
                if (window.__remoteAudioRecorder) {
                    try {
                        window.__remoteAudioRecorder.stop();
                    } catch (e) {
                        console.error('Error stopping remote audio recorder:', e);
                    }
                    window.__remoteAudioRecorder = null;
                    console.log('=== REMOTE AUDIO CAPTURE STOPPED ===');
                }
            })();
        `

        await this.page.evaluate(stopScript)
    }

    public async cleanup (): Promise<void> {
            const cleanupScript = `
                (function() {
                    if (window.originalGetUserMedia) {
                        navigator.mediaDevices.getUserMedia = window.originalGetUserMedia;
                        console.log('Restored original getUserMedia');
                    }

                    if (window.originalEnumerateDevices) {
                        navigator.mediaDevices.enumerateDevices = window.originalEnumerateDevices;
                        console.log('Restored original enumerateDevices');
                    }

                    if (window.audioContext) {
                        window.audioContext.close();
                        console.log('Audio context closed');
                    }

                    console.log('Audio system cleaned up');
                })();
            `

            await this.page.evaluate(cleanupScript)
    }
}
