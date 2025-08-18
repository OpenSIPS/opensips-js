import WebRTCMetricsAnalyzer from './WebRTCMetricsAnalyzer'

export class GoogleChatService {
    private readonly webhookUrl: string

    constructor (webhookUrl: string) {
        this.webhookUrl = webhookUrl
    }

    async sendMetricsReport (allStats: any[], userName: string): Promise<void> {
        try {
            const avgMetrics = WebRTCMetricsAnalyzer.calculateAverageMetrics(allStats)
            const formattedMessage = WebRTCMetricsAnalyzer.formatMetricsForGoogleChat(avgMetrics, userName)

            await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: formattedMessage,
                }),
            })
        } catch (error) {
            console.error('Failed to send metrics to Google Chat:', error)
            throw error
        }
    }
}
