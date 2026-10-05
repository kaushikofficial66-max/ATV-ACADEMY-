import fs from 'fs';
import { getSetting } from './settingsService.js';
import { isVimeoConfigured } from './vimeoService.js';
import { isR2Configured, uploadFileToR2, publicUrlForKey, getR2Config } from './r2Service.js';
import ApiError from '../utils/ApiError.js';

/**
 * Decides where uploads are stored, based on the `storage_driver` setting:
 *   auto  - Vimeo (videos) / Cloudflare R2 (files) when configured, otherwise this server's disk (default)
 *   cloud - Vimeo / R2 only; uploads fail with 503 if the service is not configured
 *           ("cloudflare" is accepted as an alias)
 *   local - always local disk (development / tests)
 */
export const getStorageDriver = async () => {
  const driver = String((await getSetting('storage_driver')) || 'auto').toLowerCase();
  if (driver === 'cloudflare') return 'cloud';
  return ['auto', 'cloud', 'local'].includes(driver) ? driver : 'auto';
};

/** True when recorded videos should be uploaded to Vimeo. */
export const shouldUseVimeo = async () => {
  const driver = await getStorageDriver();
  if (driver === 'local') return false;
  const configured = await isVimeoConfigured();
  if (driver === 'cloud' && !configured) {
    throw new ApiError(503, 'Video storage (Vimeo) is not configured. Add VIMEO_ACCESS_TOKEN to .env or Admin > Settings > Storage.');
  }
  return configured;
};

/**
 * True when files of this folder should go to Cloudflare R2. Images are public
 * assets, so they only move to R2 when a public bucket URL / custom domain is set.
 */
export const shouldUseR2 = async (folder) => {
  const driver = await getStorageDriver();
  if (driver === 'local') return false;
  const configured = await isR2Configured();
  if (driver === 'cloud' && !configured) {
    throw new ApiError(503, 'File storage (Cloudflare R2) is not configured. Add the CLOUDFLARE_R2_* values to .env or Admin > Settings > Storage.');
  }
  if (!configured) return false;
  if (folder === 'images' && !(await getR2Config()).publicUrl) return false;
  return true;
};

/**
 * Moves a multer-saved file to R2 when applicable and annotates it with
 * storageKey / publicUrl / storageProvider (read by storageKeyFor/publicUrlFor).
 */
export const persistUploadedFile = async (file, folder) => {
  if (!file || !(await shouldUseR2(folder))) return file;
  const key = `${folder}/${file.filename}`;
  file.storageKey = await uploadFileToR2(file.path, key, file.mimetype, file.originalname);
  file.storageProvider = 'cloudflare_r2';
  file.publicUrl = folder === 'images' ? await publicUrlForKey(key) : null;
  await fs.promises.unlink(file.path).catch(() => {});
  file.movedToRemote = true;
  return file;
};

/**
 * Stores a file the server generated itself (e.g. CSV report). Returns the
 * stored key: "r2:<folder>/<name>" or "<folder>/<name>" for local disk.
 */
export const persistGeneratedFile = async (absPath, folder, fileName, contentType) => {
  if (!(await shouldUseR2(folder))) return `${folder}/${fileName}`;
  const stored = await uploadFileToR2(absPath, `${folder}/${fileName}`, contentType, fileName);
  await fs.promises.unlink(absPath).catch(() => {});
  return stored;
};

export default { getStorageDriver, shouldUseVimeo, shouldUseR2, persistUploadedFile, persistGeneratedFile };
