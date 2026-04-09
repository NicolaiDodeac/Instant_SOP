import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let cached: S3Client | null = null

function getConfig() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const endpoint = process.env.R2_ENDPOINT
  const region = process.env.R2_REGION ?? 'auto'
  const bucket = process.env.R2_BUCKET_NAME
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error(
      'Missing R2 env: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME'
    )
  }
  return { accessKeyId, secretAccessKey, endpoint, region, bucket }
}

export function getR2Client(): S3Client {
  if (cached) return cached
  const { accessKeyId, secretAccessKey, endpoint, region } = getConfig()
  cached = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
  return cached
}

export function getR2Bucket(): string {
  return getConfig().bucket
}

export async function presignPutObject(
  key: string,
  opts: { contentType?: string; expiresIn?: number }
): Promise<string> {
  const client = getR2Client()
  const bucket = getR2Bucket()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(opts.contentType ? { ContentType: opts.contentType } : {}),
  })
  return getSignedUrl(client, command, { expiresIn: opts.expiresIn ?? 3600 })
}

export async function presignGetObject(key: string, expiresIn = 3600): Promise<string> {
  const client = getR2Client()
  const bucket = getR2Bucket()
  const command = new GetObjectCommand({ Bucket: bucket, Key: key })
  return getSignedUrl(client, command, { expiresIn })
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const client = getR2Client()
  const bucket = getR2Bucket()
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = out.Body
  if (!body) throw new Error('Empty R2 object body')
  return Buffer.from(await body.transformToByteArray())
}

export async function putObjectBytes(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const client = getR2Client()
  const bucket = getR2Bucket()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  )
}

/** Returns true if an object exists at `key`. */
export async function headObjectExists(key: string): Promise<boolean> {
  const client = getR2Client()
  const bucket = getR2Bucket()
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (e: unknown) {
    const name =
      e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : ''
    const status =
      e && typeof e === 'object' && '$metadata' in e
        ? (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined
    if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return false
    throw e
  }
}
