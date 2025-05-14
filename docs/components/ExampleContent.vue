<template>
    <div class="example pt-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">
        <div id="loginPage">
            <form id="loginToAppForm" class="login-form">
                <label>
                    Pn Params:
                    <input type="text" name="pnparams" value="">
                </label>
                <label>
                    Username:
                    <input type="text" name="username" value="">
                </label>
                <label>
                    Password:
                    <input type="text" name="password" value="">
                </label>
                <label>
                    JWT Token:
                    <input type="text" name="token" value="">
                </label>
                <label>
                    Domain:
                    <input type="text" name="domain" value="">
                </label>

                <div>
                    <div style="margin: 10px 0">
                        <input id="useAudioCheckbox" type="checkbox" name="useAudioCheckbox" checked="true" >
                        <label for="useAudioCheckbox">Audio</label>
                    </div>

                    <div style="margin: 10px 0">
                        <input id="useVideoCheckbox" type="checkbox" name="useVideoCheckbox" checked="true" >
                        <label for="useVideoCheckbox">Video</label>
                    </div>
                </div>

                <button type="submit">
                    Register
                </button>
            </form>
        </div>
        <div id="webRTCPage" style="display: none">
            <div class="navigation-tab"/>

            <div id="audioTabContainer" class="tabcontent">
                <h3>Audio Calls</h3>
                <div>
                    <select id="microphoneEl"/>
                    <select id="speakerEl"/>
                </div>

                <div class="call-quick-actions">
                    <div>
                        <label for="muteWhenJoinInputEl">Mute when join</label>
                        <input id="muteWhenJoinInputEl" type="checkbox">
                    </div>
                    <div>
                        <label for="DNDInputEl">DND</label>
                        <input id="DNDInputEl" type="checkbox">
                    </div>
                </div>

                <div>
                    <div id="muteContainerEl">
                        <button class="muteButtonEl">
                            Mute
                        </button>
                    </div>
                </div>

                <br>

                <form id="makeCallForm">
                    <label>
                        Your target:
                        <input type="text" name="target">
                    </label>
                    <button type="submit">
                        Call
                    </button>
                </form>
                <div id="callAddingIndicator" class="hidden">Calling...</div>

                <div>
                    <label for="addToCurrentRoomInputEl">Add new call to current room</label>
                    <input id="addToCurrentRoomInputEl" type="checkbox">
                </div>

                <br>

                <div>
                    <label for="inputLevel">Microphone sensitivity (between 0 and 2):</label>
                    <input
                           id="inputLevel"
                           type="number"
                           name="inputLevel"
                           value="1"
                           min="0"
                           max="1"
                           step="0.1"
                    >
                    <button id="inputLevelApplyButton">Apply</button>
                </div>
                <div>
                    <label for="outputLevel">Speaker volume (between 0 and 1):</label>
                    <input
                           id="outputLevel"
                           type="number"
                           name="outputLevel"
                           value="1"
                           min="0"
                           max="1"
                           step="0.1"
                    >
                    <button id="outputLevelApplyButton">Apply</button>
                </div>

                <br>

                <div>
                    <form id="dtmfForm">
                        <label>
                            DTMF input:
                            <input id="dtmfInput" type="text">
                        </label>
                        <button id="dtmfSendButton" type="submit" disabled>
                            Send
                        </button>
                    </form>
                </div>

                <div id="agentVoiceLevelContainer"/>

                <div>
                    Active calls: <span id="activeCallsCounter">0</span>
                    <p>Your room: </p>
                    <select id="roomSelect">
                        <option value="" class="noData" selected>No room selected</option>
                    </select>
                </div>

                <div style="display: flex; flex-direction: column">
                    <h3>VAD Configuration</h3>
                    <label>
                        positiveSpeechThreshold
                        <input
                               id="positiveSpeechThreshold"
                               type="number"
                               name="positiveSpeechThreshold"
                               value="0.5"
                               min="0"
                               max="1000"
                               step="0.01"
                        >
                    </label>
                    <label>
                        negativeSpeechThreshold
                        <input
                               id="negativeSpeechThreshold"
                               type="number"
                               name="negativeSpeechThreshold"
                               value="0.35"
                               min="0"
                               max="1000"
                               step="0.01"
                        >
                    </label>
                    <label>
                        preSpeechPadFrames
                        <input
                               id="preSpeechPadFrames"
                               type="number"
                               name="preSpeechPadFrames"
                               value="1"
                               min="0"
                               max="1000"
                               step="0.1"
                        >
                    </label>
                    <label>
                        redemptionFrames
                        <input
                               id="redemptionFrames"
                               type="number"
                               name="redemptionFrames"
                               value="8"
                               min="0"
                               max="1000"
                               step="0.1"
                        >
                    </label>
                    <label>
                        frameSamples
                        <input
                               id="frameSamples"
                               type="number"
                               name="frameSamples"
                               value="1536"
                               min="0"
                               max="5000"
                               step="1"
                        >
                    </label>
                    <label>
                        minSpeechFrames
                        <input
                               id="minSpeechFrames"
                               type="number"
                               name="minSpeechFrames"
                               value="3"
                               min="0"
                               max="1000"
                               step="0.1"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        submitUserSpeechOnPause
                        <input
                               id="submitUserSpeechOnPause"
                               type="checkbox"
                               name="submitUserSpeechOnPause"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        baseAssetPath
                        <input
                               id="baseAssetPath"
                               type="string"
                               name="baseAssetPath"
                               value="https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@latest/dist/"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        onnxWASMBasePath
                        <input
                               id="onnxWASMBasePath"
                               type="string"
                               name="onnxWASMBasePath"
                               value="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        model
                        <input
                               id="model"
                               type="string"
                               name="model"
                               value="legacy"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        startOnLoad (for v5 model)
                        <input
                               id="startOnLoad"
                               type="checkbox"
                               name="startOnLoad"
                               checked="true"
                        >
                    </label>
                    <label style="margin: 10px 0">
                        userSpeakingThreshold (for v5 model)
                        <input
                               id="userSpeakingThreshold"
                               type="number"
                               name="userSpeakingThreshold"
                               value="0.6"
                               min="0"
                               max="1000"
                               step="0.01"
                        >
                    </label>

                    <div>
                        <button id="saveVADConfigurationButton">
                            Save VAD configuration
                        </button>
                    </div>

                </div>

                <br>
                <p>RoomList</p>
                <br>

                <div id="roomsContainer"/>
            </div>

            <div id="videoTabContainer" class="tabcontent">
                <form id="videoCallForm">
                    <label>
                        Join video room:
                        <input type="text" placeholder="Room" name="target" value="abcd">
                    </label>
                    <label>
                        Display name:
                        <input type="text" placeholder="Name" name="name" value="User1">
                    </label>
                    <button type="submit">
                        Join
                    </button>
                </form>

                <button id="terminateJanusSessionButton">
                    Terminate
                </button>

                <button id="audioChangeButton">
                    Audio On
                </button>

                <button id="videoChangeButton">
                    Video On
                </button>

                <div id="mainVideoElementContainer" style="width: 100%; height: calc(100vh - 124px)"/>

                <div id="participantsVideoElements" style="width: 100%"/>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
onMounted(async () => {
    await import('../../demo/index')
})
</script>

<style lang="scss">
@import '../../demo/styles.css';

.example {
    input, select, button.tablinks {
        @apply dark:text-gray-700;
    }

    button.tablinks:not(.active) {
        @apply text-gray-700;
    }
}
</style>
