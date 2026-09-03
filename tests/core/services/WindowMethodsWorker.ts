import { Page } from 'playwright'
import { z } from 'zod'

import type { ClipPlaybackResult } from '../session/types'

const clipPlaybackResultSchema = z.object({
    status: z.enum([ 'completed', 'interrupted' ]),
})

export default class WindowMethodsWorker {
    private remoteCaptureBound = false

    constructor (
        private readonly page: Page
    ) {}

    public async implementPlayClipMethod (monitorOutgoingAudio = false): Promise<void> {
        // Use string evaluation since TypeScript version doesn't work
        const initScript = `
                (function(monitorOutgoingAudio) {
                    console.log('=== INITIALIZING AUDIO SYSTEM FOR HEADLESS/SERVER ===');

                    // Create audio context
                    window.audioContext = new (window.AudioContext || window.webkitAudioContext)();

                    // Create the controllable stream destination
                    window.mediaStreamDestination = window.audioContext.createMediaStreamDestination();
                    window.__monitorOutgoingAudio = monitorOutgoingAudio;

                    // Outgoing speech bus: volume / packet-loss apply here; gain is 1:1 with manifest.
                    window.speechInputGain = window.audioContext.createGain();
                    window.speechInputGain.gain.value = 1.0;
                    window.speechInputGain.connect(window.mediaStreamDestination);

                    if (monitorOutgoingAudio) {
                        // Duplicate the outgoing voice to the local speakers so an
                        // operator can hear what the remote party hears. The real
                        // microphone is never captured, so this cannot echo back.
                        window.speechInputGain.connect(window.audioContext.destination);
                        console.log('=== OUTGOING AUDIO MONITOR ENABLED (local speakers) ===');
                    }

                    console.log('Audio nodes created - speechInputGain:', window.speechInputGain.gain.value);

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
                })(${JSON.stringify(monitorOutgoingAudio)});
            `

        await this.page.evaluate(initScript)
    }

    public async playClip (url: string): Promise<ClipPlaybackResult> {
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

                            var audioSource = null;
                            var settled = false;

                            function finish(status) {
                                if (settled) { return; }
                                settled = true;
                                if (audioSource) {
                                    try { audioSource.disconnect(); } catch (e) {}
                                }
                                if (window.__currentClipAudio === audio) {
                                    window.__currentClipAudio = null;
                                    window.__stopCurrentClip = null;
                                }
                                resolve({ status: status });
                            }

                            // Only one clip may sound at a time: starting a new
                            // clip interrupts whatever is still playing, so
                            // overlapping audio is physically impossible.
                            if (typeof window.__stopCurrentClip === 'function') {
                                window.__stopCurrentClip();
                            }

                            window.__currentClipAudio = audio;
                            window.__stopCurrentClip = function() {
                                if (settled) { return; }
                                console.log('>>> AUDIO INTERRUPTED (barge-in) <<<');
                                try { audio.pause(); } catch (e) {}
                                finish('interrupted');
                            };

                            function connectAudio() {
                                if (!audioSource && audio.readyState >= 1) {
                                    try {
                                        audioSource = window.audioContext.createMediaElementSource(audio);
                                        audioSource.connect(window.speechInputGain);
                                    } catch (error) {
                                        console.error('Connection error:', error);
                                        reject(error);
                                    }
                                }
                            }

                            audio.addEventListener('loadedmetadata', connectAudio);
                            audio.addEventListener('canplay', connectAudio);
                            audio.addEventListener('ended', function() {
                                finish('completed');
                            });
                            audio.addEventListener('error', function(e) {
                                console.error('Audio error:', e);
                                reject(new Error('Audio playback failed'));
                            });

                            audio.src = audioUrl;
                            audio.load();

                            audio.play().then(connectAudio).catch(reject);
                        } catch (error) {
                            reject(error);
                        }
                    });
                })('${url.replace(/'/g, '\\\'')}');
            `

        const result = await this.page.evaluate(audioScript)

        return clipPlaybackResultSchema.parse(result)
    }

    /**
     * Streaming PCM playback (s16le mono): chunks are scheduled gaplessly on the
     * outgoing audio graph as they arrive, so speech starts sounding within the
     * first TTS chunk instead of after full synthesis. Integrates with
     * window.__stopCurrentClip so only one clip/stream can sound at a time.
     */
    public async startStreamClip (clipId: string, sampleRate: number): Promise<void> {
        const script = `
            (function(id, sampleRate) {
                if (!window.audioSystemReady) {
                    throw new Error('Audio system not ready');
                }

                if (typeof window.__stopCurrentClip === 'function') {
                    window.__stopCurrentClip();
                }

                window.__streamClips = window.__streamClips || {};

                var state = {
                    sampleRate: sampleRate,
                    nextTime: 0,
                    activeSources: [],
                    ended: false,
                    settled: false,
                    status: null,
                    resolvers: []
                };

                state.settle = function(status) {
                    if (state.settled) { return; }
                    state.settled = true;
                    state.status = status;
                    state.activeSources.forEach(function(src) {
                        try { src.stop(); } catch (e) {}
                    });
                    state.activeSources = [];
                    if (window.__stopCurrentClip === state.stopFn) {
                        window.__stopCurrentClip = null;
                    }
                    state.resolvers.forEach(function(resolve) { resolve({ status: status }); });
                    state.resolvers = [];
                };
                state.stopFn = function() {
                    console.log('>>> STREAM CLIP INTERRUPTED (barge-in) <<<');
                    state.settle('interrupted');
                };

                window.__streamClips[id] = state;
                window.__stopCurrentClip = state.stopFn;
            })(${JSON.stringify(clipId)}, ${JSON.stringify(sampleRate)});
        `
        await this.page.evaluate(script)
    }

    public async appendStreamClipChunk (clipId: string, base64Pcm: string): Promise<void> {
        const script = `
            (function(id, base64) {
                var state = window.__streamClips && window.__streamClips[id];
                if (!state || state.settled) { return; }

                var binary = atob(base64);
                var sampleCount = Math.floor(binary.length / 2);
                if (sampleCount === 0) { return; }

                var float32 = new Float32Array(sampleCount);
                for (var i = 0; i < sampleCount; i++) {
                    var value = (binary.charCodeAt(i * 2 + 1) << 8) | binary.charCodeAt(i * 2);
                    if (value >= 32768) { value -= 65536; }
                    float32[i] = value / 32768;
                }

                var ctx = window.audioContext;
                var buffer = ctx.createBuffer(1, sampleCount, state.sampleRate);
                buffer.copyToChannel(float32, 0);

                var source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(window.speechInputGain);

                var startAt = Math.max(ctx.currentTime + 0.05, state.nextTime);
                source.start(startAt);
                state.nextTime = startAt + buffer.duration;
                state.activeSources.push(source);

                source.onended = function() {
                    var index = state.activeSources.indexOf(source);
                    if (index >= 0) { state.activeSources.splice(index, 1); }
                    if (state.ended && state.activeSources.length === 0) {
                        state.settle('completed');
                    }
                };
            })(${JSON.stringify(clipId)}, ${JSON.stringify(base64Pcm)});
        `
        await this.page.evaluate(script)
    }

    public async endStreamClip (clipId: string): Promise<void> {
        const script = `
            (function(id) {
                var state = window.__streamClips && window.__streamClips[id];
                if (!state || state.settled) { return; }
                state.ended = true;
                if (state.activeSources.length === 0) {
                    state.settle('completed');
                }
            })(${JSON.stringify(clipId)});
        `
        await this.page.evaluate(script)
    }

    public async stopStreamClip (clipId: string): Promise<void> {
        const script = `
            (function(id) {
                var state = window.__streamClips && window.__streamClips[id];
                if (state && state.stopFn) {
                    state.stopFn();
                }
            })(${JSON.stringify(clipId)});
        `
        await this.page.evaluate(script)
    }

    public async waitStreamClipDone (clipId: string): Promise<ClipPlaybackResult> {
        const script = `
            new Promise(function(resolve) {
                var state = window.__streamClips && window.__streamClips[${JSON.stringify(clipId)}];
                if (!state) { resolve({ status: 'interrupted' }); return; }
                if (state.settled) { resolve({ status: state.status }); return; }
                state.resolvers.push(resolve);
            });
        `
        const result = await this.page.evaluate(script)

        return clipPlaybackResultSchema.parse(result)
    }

    /** Interrupt the clip started by {@link playClip}. Idempotent in the browser. */
    public async stopCurrentClip (): Promise<void> {
        await this.page.evaluate(`
            (function() {
                if (typeof window.__stopCurrentClip === 'function') {
                    window.__stopCurrentClip();
                }
            })();
        `)
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
