import { Page } from 'playwright'

export default class WindowMethodsWorker {
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
                                if (audioSource) {
                                    audioSource.disconnect();
                                }
                                resolve();
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
