# Soniox Speech Provider

Example TTS/STT provider for the OpenSIPS-JS testing framework, powered by
[Soniox](https://soniox.com/docs/sdk/web-SDK). It extends the framework's
`BaseSpeechProvider` so the engine can synthesize speech into a call and
transcribe the remote party's audio.

This lives outside `tests/core` on purpose: the core framework stays
dependency-free and only exposes the `BaseSpeechProvider` contract. Each
company implements its own provider (with whatever speech library it likes) in a
package like this one.

## Install

```bash
cd tests/providers/soniox
npm install
```

## Configure

Set your Soniox API key (a temporary key is recommended in real environments):

```bash
export SONIOX_API_KEY=your_key_here
```

> Verify the endpoint URLs, model ids and request fields against the current
> Soniox docs for your account/region. The audio the framework captures for STT
> is `audio/webm;codecs=opus`; set `sttAudioFormat` to match what your model
> expects (Soniox supports container auto-detection).

## Use it in a test run

The provider is a **runtime concern** — inject it where scenarios execute (the
core runner), not in the Nuxt UI. Pass an instance or a factory to `run()`.

```typescript
import CallTestScenarios from '../../core/definition'
import { SonioxSpeechProvider } from './SonioxSpeechProvider'

async function main () {
    const runner = new CallTestScenarios()

    // A factory gives each parallel scenario its own recognition session.
    await runner.run(() => new SonioxSpeechProvider({
        apiKey: process.env.SONIOX_API_KEY as string
    }))
}

main()
```

## Use the new actions/events in a scenario

```typescript
this.on('answer', [
    // Speak into the call
    this.textToSpeech({ payload: { text: 'Hello, how can I help you?' } }),
    // Start transcribing the remote party
    this.startTranscription({})
])

// Fires for EVERY transcript chunk (repeatable event). The latest chunk is also
// available in the context as {{textChunk.text}}.
this.on('textChunk', [
    this.textToSpeech({ payload: { text: 'You said: {{textChunk.text}}' } })
])

this.on('callEnded', [
    this.stopTranscription({})
])
```

## What you implement (the contract)

`BaseSpeechProvider` (in `tests/core/services/speech/BaseSpeechProvider.ts`):

| Method | Direction | Responsibility |
|---|---|---|
| `textToSpeech(text)` | out | Return synthesized audio bytes for `text`. |
| `startRecording()` | in | Open a streaming recognition session. |
| `writeAudioChunk(chunk)` | in | Forward captured remote audio to your STT lib. |
| `stopRecording()` | in | Close the session. |
| `emitTranscript(chunk)` | in | (inherited) Call this whenever text is recognized. |

You never manage a callback: just call the inherited `this.emitTranscript(...)`
and the framework raises the `textChunk` event and updates the context.
