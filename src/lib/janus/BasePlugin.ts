export class BasePlugin {
    public opensips = null
    public session = null
    public name: string = null

    constructor (name) {
        this.name = name
    }

    public setOpensips (opensips) {
        this.opensips = opensips
    }

    public setSession (session) {
        this.session = session
    }

    public kill () {
        this.opensips.kill(this.name)
    }
}
