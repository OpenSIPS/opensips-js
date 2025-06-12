export default defineAppConfig({
    ui: {
        primary: 'yellow',
        gray: 'slate',
        appLogo: {
            width: '164px',
            height: 'auto',
            maxWidth: '164px'
        },
    },
    seo: {
        siteName: 'OpenSIPSJS',
        siteDescription: 'The JS package for voicenter opensips',
        docsHeaderTemplate: '%s | OpenSIPSJS',
        apiHeaderTemplate: '%s | OpenSIPSJS',
        indexHeaderTemplate: 'Project Overview | OpenSIPSJS'
    },
    header: {
        showSiteName: false
    },
    // footer: {
    //
    // }
})
