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
    console.log('##########prebuild.js##########')

    console.log('Will check if demo html file exists...', demoMdFilePath)

    if (fs.existsSync(demoHtmlBuildPath)) {
        console.log('Demo html file exists.')
        //file exists
        const fileContent = fs.readFileSync(demoHtmlBuildPath).toString()
        console.log('Demo html file content:', fileContent.length)
        const demoComponentContent = generateComponentContent(fileContent)
        console.log('Demo component content:', demoComponentContent.length)
        const demoMdContent = generateMdContent()
        console.log('Demo md content:', demoMdContent.length)

        fs.writeFileSync(demoViewComponentPath, demoComponentContent)
        console.log('Demo component file generated in', demoViewComponentPath)
        fs.writeFileSync(demoMdFilePath, demoMdContent)
        console.log('Demo md file generated in', demoMdFilePath)
        fs.copyFileSync(readmePath, indexMdFilePath)
        console.log('Readme file copied from', readmePath, 'to', indexMdFilePath)
    } else {
        console.log('Demo html file does not exist.')
    }
} catch(err) {
    console.error(err)
}
