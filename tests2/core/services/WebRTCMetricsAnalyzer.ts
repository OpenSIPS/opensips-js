export interface AverageMetrics {
    avgPacketLoss: number;
    avgJitter: number;
    avgRoundTripTime: number;
    avgAudioLevel: number;
    avgBitrate: number;
    totalPacketsLost: number;
    callDuration: number;
}

export default class WebRTCMetricsAnalyzer {
    static calculateAverageMetrics (allStats: any[]): AverageMetrics {
        if (!allStats || !allStats.length) {
            return {
                avgPacketLoss: 0,
                avgJitter: 0,
                avgRoundTripTime: 0,
                avgAudioLevel: 0,
                avgBitrate: 0,
                totalPacketsLost: 0,
                callDuration: 0
            }
        }

        const validStats = allStats.filter(stat => stat?.audio)

        if (validStats.length === 0) {
            return {
                avgPacketLoss: 0,
                avgJitter: 0,
                avgRoundTripTime: 0,
                avgAudioLevel: 0,
                avgBitrate: 0,
                totalPacketsLost: 0,
                callDuration: 0
            }
        }

        const totalMetrics = validStats.reduce((acc, curr) => {
            const audio = curr.audio
            const packetsReceived = audio.packetsReceived || 0
            const packetsLost = audio.packetsLost || 0
            const packetLossRate = packetsReceived > 0 ? (packetsLost / packetsReceived) : 0

            return {
                packetLoss: acc.packetLoss + packetLossRate,
                jitter: acc.jitter + (audio.jitter || 0),
                roundTripTime: acc.roundTripTime + (audio.roundTripTime || 0),
                audioLevel: acc.audioLevel + (audio.audioLevel || 0),
                bitrate: acc.bitrate + ((audio.bytesReceived || 0) * 8 / 1000), // kbps
            }
        }, {
            packetLoss: 0,
            jitter: 0,
            roundTripTime: 0,
            audioLevel: 0,
            bitrate: 0,
        })

        const lastStat = validStats[validStats.length - 1]
        const callDuration = validStats.length * 100 // Assuming 1 second interval

        return {
            avgPacketLoss: (totalMetrics.packetLoss / validStats.length) * 100, // as percentage
            avgJitter: totalMetrics.jitter / validStats.length,
            avgRoundTripTime: totalMetrics.roundTripTime / validStats.length,
            avgAudioLevel: totalMetrics.audioLevel / validStats.length,
            avgBitrate: totalMetrics.bitrate / validStats.length,
            totalPacketsLost: lastStat.audio.packetsLost || 0,
            callDuration: callDuration / 1000 // in seconds
        }
    }

    static getQualityStatus (avgMetrics: AverageMetrics): string {
        if (
            avgMetrics.avgPacketLoss < 1 &&
            avgMetrics.avgJitter < 30 &&
            avgMetrics.avgRoundTripTime < 300
        ) {
            return '🟢 Excellent'
        } else if (
            avgMetrics.avgPacketLoss < 2 &&
            avgMetrics.avgJitter < 50 &&
            avgMetrics.avgRoundTripTime < 500
        ) {
            return '🟡 Good'
        } else {
            return '🔴 Poor'
        }
    }

    static formatMetricsForGoogleChat (metrics: AverageMetrics, user: string): string {
        const qualityStatus = this.getQualityStatus(metrics)

        return `
📊 *WebRTC Call Statistics Report: ${user}*
Quality: ${qualityStatus}

🕒 Call Duration: ${formatDuration(metrics.callDuration)}
📦 Average Packet Loss: ${metrics.avgPacketLoss.toFixed(2)}%
⏱️ Average Jitter: ${metrics.avgJitter.toFixed(2)}ms
🔄 Average RTT: ${metrics.avgRoundTripTime.toFixed(2)}ms
🎤 Average Audio Level: ${metrics.avgAudioLevel.toFixed(2)}
📈 Average Bitrate: ${(metrics.avgBitrate / 1000).toFixed(2)} kbps
❌ Total Packets Lost: ${metrics.totalPacketsLost}
    `.trim()
    }
}


function formatDuration (seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60

    const parts = []
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    parts.push(`${remainingSeconds}s`)

    return parts.join(' ')
}
