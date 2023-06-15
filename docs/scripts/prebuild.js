const fs = require('fs')
const path = require('path')

const demoComponentFileName = 'DemoView'

const rootPath = path.join(process.cwd(), '../')

const demoHtmlBuildPath = path.join(rootPath, 'demo', 'dist', 'index.html')
const readmePath = path.join(rootPath, 'README.md')


const docsSrcDirPath = path.join(process.cwd(), 'src')
const docsComponentsDirPath = path.join(docsSrcDirPath, '.vuepress', 'components')
const demoViewComponentPath = path.join(docsComponentsDirPath, `${demoComponentFileName}.vue`)

const demoMdFilePath = path.join(docsSrcDirPath, 'demo.md')
const indexMdFilePath = path.join(docsSrcDirPath, 'index.md')

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
        fs.copyFileSync(readmePath, indexMdFilePath)
    }
} catch(err) {
    console.error(err)
}