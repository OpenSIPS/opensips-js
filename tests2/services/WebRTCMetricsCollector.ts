export interface AudioMetrics {
    // Packet Statistics
    packetsReceived: number
    packetsSent: number
    packetsLost: number
    fractionLost: number

    // Quality Metrics
    jitter: number
    roundTripTime: number
    audioLevel: number
    totalAudioEnergy: number

    // Bandwidth & Network
    bytesReceived: number
    bytesSent: number
    currentDelay: number

    // Codec Information
    codec: string
    clockRate: number
    channels: number

    // Audio Processing
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

declare global {
    interface Window {
        callMetrics: CallMetricsData
        scenarioName?: string
        scenarioId?: string
    }
}

export class WebRTCMetricsCollector {
    private static readonly METRICS_INTERVAL = 100 // 100ms interval

    static collectMetrics () {
        const lastStats = window.callMetrics.stats[window.callMetrics.stats.length - 1]

        return {
            setupTime: window.callMetrics.connectionTime,
            totalDuration: Date.now() - (window.callMetrics.startTime || Date.now()),
            connectionSuccessful: window.callMetrics.connected,
            audioMetrics: lastStats?.audio || null,
            allStats: window.callMetrics.stats,
            scenarioName: window.scenarioName,
            scenarioId: window.scenarioId
        }
    }

    static initializeMetricsAnalyze () {
        console.log('[WebRTCMetricsCollector] Initializing metrics collection', {
            hasScenarioName: !!window.scenarioName,
            hasScenarioId: !!window.scenarioId,
            scenarioName: window.scenarioName
        })
        
        window.callMetrics = {
            startTime: null,
            connectionTime: null,
            stats: [],
            connected: false
        }

        const origRTCPeerConnection = window.RTCPeerConnection
        const metricsIntervalMS = this.METRICS_INTERVAL

        window.RTCPeerConnection = function (...args) {
            console.log('[WebRTCMetricsCollector] Creating new RTCPeerConnection')
            const pc = new origRTCPeerConnection(...args)

            window.callMetrics.startTime = Date.now()

            pc.oniceconnectionstatechange = () => {
                console.log('[WebRTCMetricsCollector] ICE Connection State:', pc.iceConnectionState)
                if (pc.iceConnectionState === 'connected') {
                    window.callMetrics.connected = true
                    window.callMetrics.connectionTime = Date.now() - (window.callMetrics.startTime || Date.now())
                    console.log('[WebRTCMetricsCollector] WebRTC connection established', {
                        connectionTime: window.callMetrics.connectionTime
                    })
                }
            }

            const statsInterval = setInterval(
                async () => {
                    if (pc.connectionState === 'connected') {
                        try {
                            const stats = await pc.getStats()
                            const metrics = {
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
                                    currentLocalDescription: pc.currentLocalDescription?.type || '',
                                    currentRemoteDescription: pc.currentRemoteDescription?.type || '',
                                    localCandidateType: '',
                                    remoteCandidateType: '',
                                    candidatePairState: '',
                                    availableOutgoingBitrate: 0,
                                    availableIncomingBitrate: 0
                                }
                            }

                            stats.forEach(report => {
                                if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                                    Object.assign(metrics.audio, {
                                        packetsReceived: report.packetsReceived,
                                        packetsLost: report.packetsLost,
                                        jitter: report.jitter,
                                        bytesReceived: report.bytesReceived,
                                        audioLevel: report.audioLevel || 0,
                                        totalAudioEnergy: report.totalAudioEnergy || 0,
                                        currentDelay: report.currentDelay || 0
                                    })
                                }

                                if (report.type === 'outbound-rtp' && report.kind === 'audio') {
                                    Object.assign(metrics.audio, {
                                        packetsSent: report.packetsSent,
                                        bytesSent: report.bytesSent
                                    })
                                }

                                if (report.type === 'codec') {
                                    Object.assign(metrics.audio, {
                                        codec: report.mimeType,
                                        clockRate: report.clockRate,
                                        channels: report.channels
                                    })
                                }

                                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                                    metrics.connection.candidatePairState = report.state
                                    metrics.connection.availableOutgoingBitrate = report.availableOutgoingBitrate
                                    metrics.connection.availableIncomingBitrate = report.availableIncomingBitrate
                                }

                                if (report.type === 'local-candidate') {
                                    metrics.connection.localCandidateType = report.candidateType
                                }

                                if (report.type === 'remote-candidate') {
                                    metrics.connection.remoteCandidateType = report.candidateType
                                }

                                if (report.type === 'media-source' && report.kind === 'audio') {
                                    metrics.audio.echoReturnLoss = report.echoReturnLoss || 0
                                    metrics.audio.echoReturnLossEnhancement = report.echoReturnLossEnhancement || 0
                                }
                            })

                            window.callMetrics.stats.push(metrics)

                            // Only collect metrics - sending happens from Node.js context
                            if (window.callMetrics.stats.length % 10 === 0) {
                                console.log('[WebRTCMetricsCollector] Collected metrics batch', {
                                    totalSamples: window.callMetrics.stats.length,
                                    connected: window.callMetrics.connected,
                                    latestAudioLevel: metrics.audio.audioLevel
                                })
                            }
                        } catch (e) {
                            console.error('Error collecting stats:', e)
                            window.callMetrics.lastError = e instanceof Error ? e.message : String(e)
                        }
                    }
                },
                metricsIntervalMS
            )

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
                    clearInterval(statsInterval)
                }
            }

            return pc
        }
        
        console.log('[WebRTCMetricsCollector] WebRTC metrics collection initialized')
    }
}