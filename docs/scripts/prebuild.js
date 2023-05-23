const fs = require('fs')
const path = require('path')

const demoComponentFileName = 'DemoView'

const demoHtmlBuildPath = path.join(process.cwd(), '../', 'demo', 'dist', 'index.html')
const docsSrcDirPath = path.join(process.cwd(), 'src')
const docsComponentsDirPath = path.join(docsSrcDirPath, '.vuepress', 'components')
const demoViewComponentPath = path.join(docsComponentsDirPath, `${demoComponentFileName}.vue`)

const demoMdFilePath = path.join(docsSrcDirPath, 'demo.md')

function generateComponentContent (content) {
    return `<template>${content}</template>`
}

function generateMdContent () {
    return `# Demo
<${demoComponentFileName} />
`
}

try {
    if (fs.existsSync(demoHtmlBuildPath)) {
        //file exists
        const fileContent = fs.readFileSync(demoHtmlBuildPath).toString()
        const demoComponentContent = generateComponentContent(fileContent)
        const demoMdContent = generateMdContent()

        fs.writeFileSync(demoViewComponentPath, demoComponentContent)
        fs.writeFileSync(demoMdFilePath, demoMdContent)
    }
} catch(err) {
    console.error(err)
}