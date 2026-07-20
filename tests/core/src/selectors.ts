export interface PageSelectors {
    [key: string]: string;
}

export interface SelectorsInterface {
    [key: string]: PageSelectors;
}

export const Selectors :SelectorsInterface = {
    //Login Page
    loginPage: {
        pnparamsInput: '[data-test="pnparams-input"]',
        usernameInput: '[data-test="username-input"]',
        passwordInput: '[data-test="password-input"]',
        tokenInput: '[data-test="token-input"]',
        domainInput: '[data-test="domain-input"]',
        useAudioCheckbox: '#useAudioCheckbox',
        useVideoCheckbox: '#useVideoCheckbox',
        loginButton: '[data-test="register-button"]',
    },
    //Audio Calls Page
    audioCallsPage: {
        audioCallsTab: '#audioTabButton',
        microphoneAutocomplete: '#microphoneEl',
        headPhoneAutocomplete: '#speakerEl',
        muteWhenJoinCheckbox: '#muteWhenJoinInputEl',
        DNDCheckbox: '#DNDInputEl',
        muteButton: '.muteButton',
        yourTargetInput: '#makeCallForm input',
        callButton: '#makeCallForm button',
        addNewCallToCurrentRoomCheckbox: '#addToCurrentRoomInputEl',
        microphoneSensitivityInput: '#inputLevel',
        microphoneSensitivityApplyButton: '#inputLevelApplyButton',
        speakerVolumeInput: '#outputLevel',
        speakerVolumeApplyButton: '#outputLevelApplyButton',
        DTMFInput: '#dtmfInput',
        DTMFSendButton: '#dtmfSendButton',
        activeCallsCounter: '#activeCallsCounter',
        yourRoomAutocomplete: '#roomSelect',
        logoutButton: '#logoutButton',
    },
    //Room List Page
    roomListPage: {
        muteCallButton: '[data-test="mute-agent-button"]',
        unmuteCallButton: '[data-test="unmute-agent-button"]',
        answerButton: '[data-test="answer-button"]',
        hangupButton: '[data-test="hangup-button"]',
        transferButton: '[data-test="transfer-button"]',
        holdButton: '[data-test="hold-button"]',
        unholdButton: '[data-test="unhold-button"]',
        roomListAutocomplete: '[data-test="room-select"]',
        margeCall: '[data-test="merge-button"]'
    },
    //Video Calls Page
    videoCallsPage: {
        videoTabButton: '#videoTabButton',
        videoRoomInput: 'input[name:"room"]',
        nameInput: 'input[name:"name"]',
        domainInput: 'input[name:"domain"]',
        joinButton: 'button:has-text("Join")',
        terminateButton: '#terminateJanusSessionButton',
        audioOnButton: '#audioChangeButton',
        videoOnButton: '#videoChangeButton',
        microphoneAutocomplete: '#microphoneVideoEl',
        cameraAutocomplete: '#cameraVideoEl',
        speakerAutocomplete: '#speakerVideoEl',
        screenShareButton: '#screenShareButton',
        screenShareWhiteboardButton: '#whiteboardButton',
        blurButton: '#blurButton'
    }
}
