export default class Logger {
    constructor (
        private readonly section: string,
        private readonly scenarioId: string | null = null
    ) {}

    public log (...args: any[]): void {
        const prefix = this.scenarioId ? `[${this.scenarioId}]` : ''
        console.log(`${prefix} [${this.section}]`, ...args)
    }

    public error (...args: any[]): void {
        const prefix = this.scenarioId ? `[${this.scenarioId}]` : ''
        console.error(`${prefix} [${this.section}]`, ...args)
    }

    public warn (...args: any[]): void {
        const prefix = this.scenarioId ? `[${this.scenarioId}]` : ''
        console.warn(`${prefix} [${this.section}]`, ...args)
    }
}
