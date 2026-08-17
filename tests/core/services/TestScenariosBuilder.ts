import {
    RegisterAction,
    DialAction,
    AnswerAction,
    WaitAction,
    HoldAction,
    UnholdAction,
    HangupAction,
    UnregisterAction,
    PlaySoundAction,
    GetActionData,
    ActionsScenariosBuilderImplements,
    RequestAction
} from '../types/actions'

import {
    TestContext,
    TestScenario,
    TestScenarios,
} from '../types/intex'
import {
    ActionsPerEvent, EventHandler,
    EventsMap, EventType
} from '../types/events'

import ScenarioManager from './ScenarioManager'
import { SendDTMFAction } from '../types/actions'
import { GetActionDefinition } from '../types/actions'
import { TransferAction } from '../types/actions'
import { ChangeRoomAction } from '../types/actions'
import { DNDAction } from '../types/actions'
import {
    TextToSpeechAction,
    StartTranscriptionAction,
    StopTranscriptionAction
} from '../types/actions'
import { SpeechProviderInput } from './speech/BaseSpeechProvider'

import env from '../env'

/**
 * Base class for defining test scenarios
 */
export default abstract class TestScenariosBuilder implements ActionsScenariosBuilderImplements {
    protected speechProvider?: SpeechProviderInput

    public register (data: GetActionData<RegisterAction>): GetActionDefinition<RegisterAction> {
        return {
            type: 'register',
            data
        }
    }

    public dial (data: GetActionData<DialAction>): GetActionDefinition<DialAction> {
        return {
            type: 'dial',
            data
        }
    }

    public wait (data: GetActionData<WaitAction>): GetActionDefinition<WaitAction> {
        return {
            type: 'wait',
            data
        }
    }

    public playSound (data: GetActionData<PlaySoundAction>): GetActionDefinition<PlaySoundAction> {
        return {
            type: 'playSound',
            data
        }
    }

    public answer (data: GetActionData<AnswerAction>): GetActionDefinition<AnswerAction> {
        return {
            type: 'answer',
            data
        }
    }

    public hold (data: GetActionData<HoldAction>): GetActionDefinition<HoldAction> {
        return {
            type: 'hold',
            data
        }
    }

    public unhold (data: GetActionData<UnholdAction>): GetActionDefinition<UnholdAction> {
        return {
            type: 'unhold',
            data
        }
    }

    public hangup (data: GetActionData<HangupAction>): GetActionDefinition<HangupAction> {
        return {
            type: 'hangup',
            data
        }
    }

    public unregister (data: GetActionData<UnregisterAction>): GetActionDefinition<UnregisterAction> {
        return {
            type: 'unregister',
            data
        }
    }

    public sendDTMF (data: GetActionData<SendDTMFAction>): GetActionDefinition<SendDTMFAction> {
        return {
            type: 'sendDTMF',
            data
        }
    }

    public transfer (data: GetActionData<TransferAction>): GetActionDefinition<TransferAction> {
        return {
            type: 'transfer',
            data
        }
    }

    public changeRoom (data: GetActionData<ChangeRoomAction>): GetActionDefinition<ChangeRoomAction> {
        return {
            type: 'changeRoom',
            data
        }
    }

    public DND (data: GetActionData<DNDAction>): GetActionDefinition<DNDAction> {
        return {
            type: 'DND',
            data
        }
    }

    public request (data: GetActionData<RequestAction>): GetActionDefinition<RequestAction> {
        return {
            type: 'request',
            data
        }
    }

    public textToSpeech (data: GetActionData<TextToSpeechAction>): GetActionDefinition<TextToSpeechAction> {
        return {
            type: 'textToSpeech',
            data
        }
    }

    public startTranscription (data: GetActionData<StartTranscriptionAction>): GetActionDefinition<StartTranscriptionAction> {
        return {
            type: 'startTranscription',
            data
        }
    }

    public stopTranscription (data: GetActionData<StopTranscriptionAction>): GetActionDefinition<StopTranscriptionAction> {
        return {
            type: 'stopTranscription',
            data
        }
    }

    protected on<E extends keyof EventsMap> (
        event: E,
        actions: readonly ActionsPerEvent<E>[]
    ): EventHandler<E> {
        return {
            event,
            actions
        }
    }

    protected createScenario (
        name: string,
        eventHandlers: EventHandler<EventType>[]
    ): TestScenario {
        return {
            name,
            actions: eventHandlers
        }
    }

    getEnvContext (): TestContext {
        return typeof env.PARAMETERS === 'string' ? JSON.parse(env.PARAMETERS) : env.PARAMETERS
    }

    abstract getInitialContext(): TestContext

    // Abstract method that must be implemented to define scenarios
    abstract init(): Promise<TestScenarios>

    // Method to execute the scenarios
    async run (speechProvider?: SpeechProviderInput): Promise<void> {
        const scenarios = await this.init()
        const initialContext = this.getInitialContext()

        const manager = new ScenarioManager(
            scenarios,
            {
                ...this.getEnvContext(),
                ...initialContext
            },
            speechProvider ?? this.speechProvider
        )
        await manager.runScenarios()
    }
}
