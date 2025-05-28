import { QrynClient as SourceQrynClient } from 'qryn-client'
import env, { GigapipeConfigType, GIGAPIPE_TYPES } from '../env'

type NotDefaultGigapipeTypes = Exclude<GIGAPIPE_TYPES, 'DEFAULT'>

export default class QrynClient {
    public client?: SourceQrynClient

    constructor (
        private readonly gigapipe_type: NotDefaultGigapipeTypes,
    ) {
        if (this.getEffectiveConfig) {
            this.client = new SourceQrynClient({
                baseUrl: this.getEffectiveConfig.url,
                auth: {
                    username: this.getEffectiveConfig.username,
                    password: this.getEffectiveConfig.password,
                },
                timeout: 10000,
            })
        } else {
            console.warn(`[QrynClient] No GIGAPIPE.${this.gigapipe_type} or DEFAULT config found.`)
        }
    }

    // Static method to get configuration status
    public get isQrynConfigured (): boolean {
        return Boolean(this.client)
    }

    // Static method to get effective configuration
    public get getEffectiveConfig (): GigapipeConfigType | null {
        const gigapipeConfig = env.GIGAPIPE

        if (!gigapipeConfig) {
            return null
        }

        return gigapipeConfig[this.gigapipe_type] || gigapipeConfig.DEFAULT || null
    }
}
