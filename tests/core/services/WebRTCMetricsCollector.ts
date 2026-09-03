import type { Page } from 'playwright'

export interface AudioMetrics {
    packetsReceived: number
    packetsSent: number
    packetsLost: number
    fractionLost: number
    jitter: number
    roundTripTime: number
    audioLevel: number
    totalAudioEnergy: number
    bytesReceived: number
    bytesSent: number
    currentDelay: number
    codec: string
    clockRate: number
    channels: number
    echoReturnLoss: number
    echoReturnLossEnhancement: number
}

export interface ConnectionMetrics {
    iceConnectionState: RTCIceConnectionState
    connectionState: RTCPeerConnectionState
    currentLocalDescription: string
    currentRemoteDescription: string
    localCandidateType: string
    remoteCandidateType: string
    candidatePairState: string
    availableOutgoingBitrate?: number
    availableIncomingBitrate?: number
}

export interface CallMetric {
    timestamp: number
    audio: AudioMetrics
    connection: ConnectionMetrics
}

export interface CallMetricsData {
    startTime: number | null
    connectionTime: number | null
    stats: CallMetric[]
    connected: boolean
    lastError?: string
}

export interface WebRTCMetricsSnapshot {
    setupTime: number | null
    totalDuration: number
    connectionSuccessful: boolean
    audioMetrics: AudioMetrics | null
    allStats: CallMetric[]
    scenarioName?: string
    scenarioId?: string
}

declare global {
    interface Window {
        callMetrics: CallMetricsData
        scenarioName?: string
        scenarioId?: string
        __latestRemoteAudioStream?: MediaStream
        __remoteAudioRecorder?: MediaRecorder | null
        __onRemoteAudioChunk?: (base64: string) => void
        __hasActiveCall?: boolean
        __webrtcMetricsPatched?: boolean
        WebRTCMetricsCollector?: {
            METRICS_INTERVAL: number
            collectMetrics: () => WebRTCMetricsSnapshot
            initializeMetricsAnalyze: () => void
        }
    }
}

export const METRICS_INTERVAL_MS = 100

/**
 * Pure browser JS string — never pass a TS function to page.evaluate/addInitScript
 * under tsx/esbuild or `__name` / module bindings leak into the browser context.
 */
export const INITIALIZE_METRICS_ANALYZE_SCRIPT = `
(function() {
    if (window.__webrtcMetricsPatched) {
        return;
    }

    console.log('[WebRTCMetricsCollector] Initializing metrics collection', {
        hasScenarioName: !!window.scenarioName,
        hasScenarioId: !!window.scenarioId,
        scenarioName: window.scenarioName
    });

    window.callMetrics = {
        startTime: null,
        connectionTime: null,
        stats: [],
        connected: false
    };

    var origRTCPeerConnection = window.RTCPeerConnection;
    var metricsIntervalMS = 100;

    var patchedRTCPeerConnection = function() {
        console.log('[WebRTCMetricsCollector] Creating new RTCPeerConnection');
        var pc = Reflect.construct(origRTCPeerConnection, arguments);

        window.callMetrics.startTime = Date.now();

        pc.addEventListener('track', function(event) {
            try {
                if (event.track && event.track.kind === 'audio') {
                    window.__latestRemoteAudioStream = (event.streams && event.streams[0])
                        ? event.streams[0]
                        : new MediaStream([event.track]);
                    console.log('[WebRTCMetricsCollector] Captured remote audio stream for STT');
                }
            } catch (e) {
                console.error('[WebRTCMetricsCollector] Error capturing remote audio track:', e);
            }
        });

        pc.oniceconnectionstatechange = function() {
            console.log('[WebRTCMetricsCollector] ICE Connection State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected') {
                window.callMetrics.connected = true;
                window.__hasActiveCall = true;
                window.callMetrics.connectionTime = Date.now() - (window.callMetrics.startTime || Date.now());
                console.log('[WebRTCMetricsCollector] WebRTC connection established', {
                    connectionTime: window.callMetrics.connectionTime
                });
            }
        };

        var statsInterval = setInterval(function() {
            if (pc.connectionState !== 'connected') {
                return;
            }

            pc.getStats().then(function(stats) {
                var metrics = {
                    timestamp: Date.now(),
                    audio: {
                        packetsReceived: 0,
                        packetsSent: 0,
                        packetsLost: 0,
                        fractionLost: 0,
                        jitter: 0,
                        roundTripTime: 0,
                        audioLevel: 0,
                        totalAudioEnergy: 0,
                        bytesReceived: 0,
                        bytesSent: 0,
                        currentDelay: 0,
                        codec: '',
                        clockRate: 0,
                        channels: 0,
                        echoReturnLoss: 0,
                        echoReturnLossEnhancement: 0
                    },
                    connection: {
                        iceConnectionState: pc.iceConnectionState,
                        connectionState: pc.connectionState,
                        currentLocalDescription: (pc.currentLocalDescription && pc.currentLocalDescription.type) || '',
                        currentRemoteDescription: (pc.currentRemoteDescription && pc.currentRemoteDescription.type) || '',
                        localCandidateType: '',
                        remoteCandidateType: '',
                        candidatePairState: '',
                        availableOutgoingBitrate: 0,
                        availableIncomingBitrate: 0
                    }
                };

                stats.forEach(function(report) {
                    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                        metrics.audio.packetsReceived = report.packetsReceived;
                        metrics.audio.packetsLost = report.packetsLost;
                        metrics.audio.jitter = report.jitter;
                        metrics.audio.bytesReceived = report.bytesReceived;
                        metrics.audio.audioLevel = report.audioLevel || 0;
                        metrics.audio.totalAudioEnergy = report.totalAudioEnergy || 0;
                        metrics.audio.currentDelay = report.currentDelay || 0;
                    }

                    if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                        metrics.audio.packetsSent = report.packetsSent;
                        metrics.audio.bytesSent = report.bytesSent;
                    }

                    if (report.type === 'codec') {
                        metrics.audio.codec = report.mimeType;
                        metrics.audio.clockRate = report.clockRate;
                        metrics.audio.channels = report.channels;
                    }

                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        metrics.connection.candidatePairState = report.state;
                        metrics.connection.availableOutgoingBitrate = report.availableOutgoingBitrate;
                        metrics.connection.availableIncomingBitrate = report.availableIncomingBitrate;
                    }

                    if (report.type === 'local-candidate') {
                        metrics.connection.localCandidateType = report.candidateType;
                    }

                    if (report.type === 'remote-candidate') {
                        metrics.connection.remoteCandidateType = report.candidateType;
                    }

                    if (report.type === 'media-source' && report.kind === 'audio') {
                        metrics.audio.echoReturnLoss = report.echoReturnLoss || 0;
                        metrics.audio.echoReturnLossEnhancement = report.echoReturnLossEnhancement || 0;
                    }
                });

                window.callMetrics.stats.push(metrics);

                if (window.callMetrics.stats.length % 10 === 0) {
                    console.log('[WebRTCMetricsCollector] Collected metrics batch', {
                        totalSamples: window.callMetrics.stats.length,
                        connected: window.callMetrics.connected,
                        latestAudioLevel: metrics.audio.audioLevel
                    });
                }
            }).catch(function(e) {
                console.error('Error collecting stats:', e);
                window.callMetrics.lastError = e && e.message ? e.message : String(e);
            });
        }, metricsIntervalMS);

        pc.onconnectionstatechange = function() {
            if (pc.connectionState === 'connected') {
                window.__hasActiveCall = true;
            } else if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                window.__hasActiveCall = false;
                clearInterval(statsInterval);
            } else if (pc.connectionState === 'disconnected') {
                window.__hasActiveCall = false;
            }
        };

        return pc;
    };

    window.RTCPeerConnection = patchedRTCPeerConnection;
    window.__webrtcMetricsPatched = true;
    window.WebRTCMetricsCollector = {
        METRICS_INTERVAL: 100,
        collectMetrics: function() {
            var lastStats = window.callMetrics.stats[window.callMetrics.stats.length - 1];
            return {
                setupTime: window.callMetrics.connectionTime,
                totalDuration: Date.now() - (window.callMetrics.startTime || Date.now()),
                connectionSuccessful: window.callMetrics.connected,
                audioMetrics: lastStats ? lastStats.audio : null,
                allStats: window.callMetrics.stats,
                scenarioName: window.scenarioName,
                scenarioId: window.scenarioId
            };
        },
        initializeMetricsAnalyze: function() {}
    };

    console.log('[WebRTCMetricsCollector] WebRTC metrics collection initialized');
})();
`

export const COLLECT_METRICS_SCRIPT = `
(function() {
    var lastStats = window.callMetrics.stats[window.callMetrics.stats.length - 1];
    return {
        setupTime: window.callMetrics.connectionTime,
        totalDuration: Date.now() - (window.callMetrics.startTime || Date.now()),
        connectionSuccessful: window.callMetrics.connected,
        audioMetrics: lastStats ? lastStats.audio : null,
        allStats: window.callMetrics.stats,
        scenarioName: window.scenarioName,
        scenarioId: window.scenarioId
    };
})()
`

export async function installWebRTCMetricsAnalyze (page: Page): Promise<void> {
    await page.evaluate(INITIALIZE_METRICS_ANALYZE_SCRIPT)
}

export async function collectWebRTCMetricsFromPage (page: Page): Promise<WebRTCMetricsSnapshot> {
    return page.evaluate(COLLECT_METRICS_SCRIPT) as Promise<WebRTCMetricsSnapshot>
}

/** @deprecated Use installWebRTCMetricsAnalyze / collectWebRTCMetricsFromPage. */
export class WebRTCMetricsCollector {
    static readonly METRICS_INTERVAL = METRICS_INTERVAL_MS

    static initializeMetricsAnalyze = INITIALIZE_METRICS_ANALYZE_SCRIPT

    static collectMetrics = COLLECT_METRICS_SCRIPT
}
