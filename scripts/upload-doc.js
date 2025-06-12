const dotenv = require('dotenv')
dotenv.config()

const { Uploader } = require('@voicenter-team/aws-uploader')
const path = require('path')

const S3_BUCKET = process.env.S3_BUCKET
const S3_REGION = process.env.S3_REGION
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY
const S3_CLOUDFRONT_DISTRIBUTION_ID = process.env.S3_CLOUDFRONT_DISTRIBUTION_ID

const targetDir = 'dist'

const directoryPathToDeploy = path.join(process.cwd(), 'docs', '.output', 'public')

const uploader = new Uploader({
    region: S3_REGION,
    silent: false,
    credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY
    },
    cloudFrontDistributionId: S3_CLOUDFRONT_DISTRIBUTION_ID
})

async function deploy () {
    try {
        // Upload the 'dist' folder to the versioned directory
        await uploader.proceedUploadDirectory(
            S3_BUCKET,
            directoryPathToDeploy,
            targetDir,
            {
                ACL: 'public-read',
            },
            {
                invalidate: true,
            }
        )

        console.log('Deployment and backup completed successfully.')
    } catch (error) {
        console.error('Deployment failed:', error)
    }
}

deploy()
