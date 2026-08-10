import TestScenariosBuilder from '../../../services/TestScenariosBuilder'
import type { TestScenarios } from '../../../types/intex'
export default class AiVoiceBotScenario extends TestScenariosBuilder {
    private static readonly LOGIN_URL = 'https://loginapi.voicenter.com/Auth/Login/Voicenter/Chrome'
    private static readonly SETTINGS_URL = 'https://loginapi.voicenter.com/Application/GetSettings'

    private static readonly TARGET_EXTENSION = '39'

    getInitialContext () {
        return {}
    }

    async init (): Promise<TestScenarios> {
        return [
            this.createScenario('operator-bot', [
                this.on('ready', [
                    this.request({
                        payload: {
                            url: AiVoiceBotScenario.LOGIN_URL,
                            options: {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                data: {
                                    email: '{{CALLER.API.EMAIL}}',
                                    password: '{{CALLER.API.PASSWORD}}'
                                }
                            }
                        },
                        responseToContext: {
                            setToContext: true,
                            contextKeyToSet: 'login_response'
                        }
                    }),
                    this.request({
                        payload: {
                            url: AiVoiceBotScenario.SETTINGS_URL,
                            options: {
                                method: 'GET',
                                headers: {
                                    Authorization: 'Bearer {{login_response.response.Data.AccessToken}}'
                                }
                            }
                        },
                        responseToContext: {
                            setToContext: true,
                            contextKeyToSet: 'settings_response'
                        }
                    }),
                    this.register({
                        payload: {
                            sip_domain: 'wss07.voicenter.co', //'{{settings_response.response.WebRTCData.domain}}',
                            username: '{{settings_response.response.WebRTCData.extension_user}}',
                            password: '{{settings_response.response.WebRTCData.extension_pass}}'
                        },
                        customSharedEvent: 'bot_registered'
                    }),
                    this.dial({
                        payload: { target: AiVoiceBotScenario.TARGET_EXTENSION },
                        customSharedEvent: 'call_initiated'
                    })
                ]),

                this.on('call_initiated', [
                    this.wait({ payload: { time: 1000 } }),
                    this.startTranscription({ customSharedEvent: 'bot_listening' })
                ] as never),

                this.on('callEnded', [
                    this.stopTranscription({}),
                    this.unregister({})
                ] as never)
            ])
        ]
    }
}
