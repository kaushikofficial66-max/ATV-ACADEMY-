import fs from 'fs';
import { S3Client, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getGroupSettings } from './settingsService.js';
import ApiError from '../utils/ApiError.js';

/**
 * Cloudflare R2 object storage (documents, project files, images, reports).
 * R2 speaks the S3 API, so the standard S3 client is pointed at
 * https://<account_id>.r2.cloudflarestorage.com - no AWS account is involved.
 *
 * Keys are stored in the database as "r2:<key>", e.g. "r2:documents/123-abc.pdf".
 */

export const R2_PREFIX = 'r2:';

let client = null;
let clientKey = '';

export const getR2Config = async () => {
  const cfg = await getGroupSettings('storage');
  return {
    accountId: cfg.cloudflare_account_id,
    accessKeyId: cfg.cloudflare_r2_access_key_id,
    secretAccessKey: cfg.cloudflare_r2_secret_access_key,
    bucket: cfg.cloudflare_r2_bucket,
    publicUrl: (cfg.cloudflare_r2_public_url || '').replace(/\/+$/, '')
  };
};

export const isR2Configured = async () => {
  const cfg = await getR2Config();
  return Boolean(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket);
};

const getClient = async () => {
  const cfg = await getR2Config();
  if (!cfg.accountId || !cfg.accessKeyId || !cfg.secretAccessKey || !cfg.bucket) {
    throw new ApiError(503, 'Cloudflare R2 is not configured. Add the R2 credentials and bucket in Admin > Settings > Storage.');
  }
  const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || `https://${cfg.accountId}.r2.cloudflarestorage.com`;
  const key = `${endpoint}|${cfg.accessKeyId}|${cfg.secretAccessKey}`;
  if (!client || key !== clientKey) {
    client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: Boolean(process.env.CLOUDFLARE_R2_ENDPOINT),
      // Recommended by Cloudflare for R2: only send/validate checksums when required.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    });
    clientKey = key;
  }
  return { client, cfg };
};

const r2Error = (error, action) => new ApiError(502, `Cloudflare R2 ${action} failed: ${error.name || ''} ${error.message}`.trim());

export const isR2Key = (value) => typeof value === 'string' && value.startsWith(R2_PREFIX);
export const stripR2Prefix = (value) => (isR2Key(value) ? value.slice(R2_PREFIX.length) : value);

/** Uploads a local file (multipart for large files) and returns the stored "r2:<key>". */
export const uploadFileToR2 = async (localPath, key, contentType = 'application/octet-stream', downloadName = null) => {
  const { client: s3, cfg } = await getClient();
  try {
    await new Upload({
      client: s3,
      params: {
        Bucket: cfg.bucket,
        Key: key,
        Body: fs.createReadStream(localPath),
        ContentType: contentType,
        ...(downloadName && { ContentDisposition: `inline; filename="${encodeURIComponent(downloadName)}"` })
      },
      queueSize: 4,
      partSize: 16 * 1024 * 1024
    }).done();
  } catch (error) {
    throw r2Error(error, 'upload');
  }
  return `${R2_PREFIX}${key}`;
};

/** Public URL for keys under a public bucket / custom domain (images). */
export const publicUrlForKey = async (key) => {
  const cfg = await getR2Config();
  return cfg.publicUrl ? `${cfg.publicUrl}/${stripR2Prefix(key)}` : null;
};

/** Maps a public R2 URL back to its key (for deletes), or null. */
export const keyFromPublicUrl = async (url) => {
  const cfg = await getR2Config();
  if (!cfg.publicUrl || typeof url !== 'string' || !url.startsWith(`${cfg.publicUrl}/`)) return null;
  return url.slice(cfg.publicUrl.length + 1);
};

/** Readable stream + metadata for proxying downloads through the API. */
export const getR2Object = async (storedKey) => {
  const { client: s3, cfg } = await getClient();
  try {
    const out = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: stripR2Prefix(storedKey) }));
    return { body: out.Body, contentType: out.ContentType, contentLength: out.ContentLength };
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) throw ApiError.notFound('File not found in storage.');
    throw r2Error(error, 'download');
  }
};

export const deleteR2Object = async (storedKey) => {
  const { client: s3, cfg } = await getClient();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: stripR2Prefix(storedKey) }));
  } catch (error) {
    console.warn(`[R2]: could not delete ${storedKey}: ${error.message}`);
  }
};

/** Time-limited direct download link (e.g. for very large files). */
export const presignR2Download = async (storedKey, { expiresIn = 600, downloadName = null } = {}) => {
  const { client: s3, cfg } = await getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: stripR2Prefix(storedKey),
      ...(downloadName && { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(downloadName)}"` })
    }),
    { expiresIn }
  );
};

export const testR2Connection = async () => {
  const { client: s3, cfg } = await getClient();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
    return { ok: true, bucket: cfg.bucket, public_url: cfg.publicUrl || null };
  } catch (error) {
    throw r2Error(error, 'connection test');
  }
};

export default {
  R2_PREFIX,
  getR2Config,
  isR2Configured,
  isR2Key,
  stripR2Prefix,
  uploadFileToR2,
  publicUrlForKey,
  keyFromPublicUrl,
  getR2Object,
  deleteR2Object,
  presignR2Download,
  testR2Connection
};
