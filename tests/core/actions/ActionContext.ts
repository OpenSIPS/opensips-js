import type { ActiveCall } from '../session/types'

export interface ActionContext {
    call: ActiveCall
    log: (entry: Record<string, unknown>) => void
}
