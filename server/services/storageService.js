import fs from 'fs';
import path from 'path';
import { FileModel } from '../models/index.js';
import { UPLOAD_ROOT, storageKeyFor, publicUrlFor } from '../middlewares/upload.js';
import { pipeline } from 'stream/promises';
import ApiError from '../utils/ApiError.js';
import { isR2Key, stripR2Prefix, deleteR2Object, getR2Object, keyFromPublicUrl, R2_PREFIX } from './r2Service.js';

/**
 * Records an uploaded file in the `files` table and returns the row.
 */
export const recordFile = async (file, { uploadedBy, entityType = null, entityId = null, transaction = null } = {}) => {
  if (!file) return null;
  return FileModel.create(
    {
      uploaded_by: uploadedBy,
      original_name: file.originalname.slice(0, 255),
      file_name: file.filename,
      storage_provider: file.storageProvider || 'local',
      storage_key: storageKeyFor(file),
      file_url: publicUrlFor(file),
      mime_type: file.mimetype,
      file_size: file.size,
      entity_type: entityType,
      entity_id: entityId
    },
    { transaction }
  );
};

/** Records an asset that lives only on a remote service (e.g. a Vimeo video). */
export const recordRemoteFile = async ({ uploadedBy, provider, storageKey, url, originalName, mimeType = null, size = null, entityType = null, entityId = null, transaction = null }) =>
  FileModel.create(
    {
      uploaded_by: uploadedBy,
      original_name: String(originalName || storageKey).slice(0, 255),
      file_name: String(storageKey).slice(0, 255),
      storage_provider: provider,
      storage_key: storageKey,
      file_url: url,
      mime_type: mimeType,
      file_size: size,
      entity_type: entityType,
      entity_id: entityId
    },
    { transaction }
  );

/** Links previously recorded files to an entity once its id is known. */
export const linkFile = async (fileRow, entityType, entityId, transaction = null) => {
  if (fileRow) await fileRow.update({ entity_type: entityType, entity_id: entityId }, { transaction });
};

/**
 * Resolves a local storage key or /uploads/... URL to an absolute path inside
 * uploads/, rejecting path traversal. Returns null for remote (R2 / http) files.
 */
export const resolveLocalPath = (keyOrUrl) => {
  if (!keyOrUrl || /^https?:\/\//i.test(keyOrUrl) || isR2Key(keyOrUrl)) return null;
  const rel = String(keyOrUrl).replace(/^\/?uploads\//, '').replace(/^\/+/, '');
  const abs = path.resolve(UPLOAD_ROOT, rel);
  if (!abs.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return null;
  return abs;
};

/**
 * Deletes a stored file - local disk, R2 key ("r2:...") or public R2 URL -
 * and soft-deletes its `files` row. Never throws.
 */
export const removeStoredFile = async (keyOrUrl) => {
  if (!keyOrUrl) return;
  try {
    if (isR2Key(keyOrUrl)) {
      await deleteR2Object(keyOrUrl);
      await FileModel.update({ status: 'deleted' }, { where: { storage_key: keyOrUrl } });
      return;
    }
    const publicKey = /^https?:\/\//i.test(keyOrUrl) ? await keyFromPublicUrl(keyOrUrl) : null;
    if (publicKey) {
      await deleteR2Object(`${R2_PREFIX}${publicKey}`);
      await FileModel.update({ status: 'deleted' }, { where: { storage_key: `${R2_PREFIX}${publicKey}` } });
      return;
    }
    const abs = resolveLocalPath(keyOrUrl);
    if (!abs) return;
    await fs.promises.unlink(abs).catch((error) => {
      if (error.code !== 'ENOENT') console.warn(`[Storage]: could not delete ${abs}: ${error.message}`);
    });
    const rel = path.relative(UPLOAD_ROOT, abs).split(path.sep).join('/');
    await FileModel.update({ status: 'deleted' }, { where: { storage_key: rel } });
  } catch (error) {
    console.warn(`[Storage]: could not remove ${keyOrUrl}: ${error.message}`);
  }
};

/** Removes uploaded files (local temp and R2 copies) when the request fails afterwards. */
export const cleanupUploadedFiles = async (req) => {
  const files = [];
  if (req.file) files.push(req.file);
  if (req.files) {
    const list = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
    files.push(...list);
  }
  await Promise.all(
    files.map(async (f) => {
      if (f.storageKey && isR2Key(f.storageKey)) await deleteR2Object(f.storageKey).catch(() => {});
      await fs.promises.unlink(f.path).catch(() => {});
    })
  );
};

const contentDisposition = (type, name) =>
  `${type}; filename="${String(name).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

/**
 * Sends a private file as a download / inline response. Local files are sent
 * from disk; R2 files are streamed through the API (no bucket URL is exposed).
 */
export const sendStoredFile = async (res, keyOrUrl, { downloadName = null, inline = false } = {}) => {
  if (isR2Key(keyOrUrl)) {
    const object = await getR2Object(keyOrUrl);
    const name = downloadName || stripR2Prefix(keyOrUrl).split('/').pop();
    res.setHeader('Content-Type', object.contentType || 'application/octet-stream');
    if (object.contentLength) res.setHeader('Content-Length', object.contentLength);
    res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', name));
    res.setHeader('Cache-Control', 'private, no-store');
    return pipeline(object.body, res);
  }
  const abs = resolveLocalPath(keyOrUrl);
  if (!abs) {
    if (/^https?:\/\//i.test(keyOrUrl)) return res.redirect(keyOrUrl);
    throw ApiError.notFound('File not found.');
  }
  if (!fs.existsSync(abs)) throw ApiError.notFound('File not found on server.');
  if (inline) return res.sendFile(abs);
  return res.download(abs, downloadName || path.basename(abs));
};

/**
 * Streams a video with HTTP Range support so players can seek.
 */
export const streamVideoFile = (req, res, keyOrUrl, mimeType = 'video/mp4') => {
  const abs = resolveLocalPath(keyOrUrl);
  if (!abs || !fs.existsSync(abs)) throw ApiError.notFound('Video file not found.');

  const { size } = fs.statSync(abs);
  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType || 'video/mp4');
  res.setHeader('Cache-Control', 'private, no-store');

  if (!range) {
    res.setHeader('Content-Length', size);
    return fs.createReadStream(abs).pipe(res);
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : Math.min(start + 5 * 1024 * 1024, size - 1);
  if (match && !match[1] && match[2]) {
    start = Math.max(0, size - parseInt(match[2], 10));
    end = size - 1;
  }
  if (start >= size || end >= size || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  return fs.createReadStream(abs, { start, end }).pipe(res);
};

export default {
  recordFile,
  recordRemoteFile,
  linkFile,
  resolveLocalPath,
  removeStoredFile,
  cleanupUploadedFiles,
  sendStoredFile,
  streamVideoFile
};
