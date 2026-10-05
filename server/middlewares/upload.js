import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import ApiError from '../utils/ApiError.js';
import { persistUploadedFile } from '../services/storageDriver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local upload folder (temp files before they move to Vimeo / R2, or permanent storage when
// they don't). UPLOAD_DIR overrides it, e.g. for tests.
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', 'uploads');

/**
 * Folders under uploads/. Only `images` is served statically (public);
 * every other folder is private and served by access-checked endpoints.
 */
export const UPLOAD_FOLDERS = ['images', 'videos', 'documents', 'projects', 'reports', 'certificates'];
UPLOAD_FOLDERS.forEach((sub) => fs.mkdirSync(path.join(UPLOAD_ROOT, sub), { recursive: true }));

const MB = 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'text/plain',
  'text/csv',
  'application/json',
  ...IMAGE_TYPES.filter((t) => t !== 'image/svg+xml')
];
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.com', '.scr', '.ps1', '.vbs', '.jar', '.dll', '.php', '.html', '.htm', '.js'];

const PROFILES = {
  image: { folder: 'images', maxSize: 5 * MB, accept: (f) => IMAGE_TYPES.includes(f.mimetype), label: 'an image (JPG, PNG, WEBP, GIF, SVG)' },
  video: {
    folder: 'videos',
    maxSize: Number(process.env.MAX_VIDEO_SIZE_MB || 2048) * MB,
    accept: (f) => f.mimetype.startsWith('video/'),
    label: 'a video file'
  },
  document: { folder: 'documents', maxSize: 200 * MB, accept: (f) => DOCUMENT_TYPES.includes(f.mimetype) || f.mimetype.startsWith('video/') || f.mimetype.startsWith('audio/'), label: 'a document, archive, image, audio or video file' },
  project: { folder: 'projects', maxSize: 500 * MB, accept: () => true, label: 'a project file' }
};

const buildUploader = (profileName) => {
  const profile = PROFILES[profileName];
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, path.join(UPLOAD_ROOT, profile.folder)),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
      }
    }),
    limits: { fileSize: profile.maxSize },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (BLOCKED_EXTENSIONS.includes(ext)) return cb(new ApiError(415, `Files of type ${ext} are not allowed.`));
      if (!profile.accept(file)) return cb(new ApiError(415, `Invalid file type for "${file.fieldname}". Please upload ${profile.label}.`));
      return cb(null, true);
    }
  });
};

/**
 * After multer has written the file to disk, move it to Cloudflare R2 when
 * the storage settings say so (see services/storageDriver.js). Videos are
 * not moved here: controllers upload them to Vimeo.
 */
const persistMiddleware = (folder) => async (req, res, next) => {
  const files = req.file ? [req.file] : req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : [];
  for (const file of files) await persistUploadedFile(file, folder);
  next();
};

/** Same API as multer (`.single`, `.array`, `.fields`) plus cloud persistence. */
const withCloudStorage = (profileName) => {
  const uploader = buildUploader(profileName);
  const { folder } = PROFILES[profileName];
  if (profileName === 'video') return uploader;
  return {
    single: (field) => [uploader.single(field), persistMiddleware(folder)],
    array: (field, max) => [uploader.array(field, max), persistMiddleware(folder)],
    fields: (fields) => [uploader.fields(fields), persistMiddleware(folder)]
  };
};

export const uploadImage = withCloudStorage('image');
export const uploadVideo = withCloudStorage('video');
export const uploadDocument = withCloudStorage('document');
export const uploadProject = withCloudStorage('project');

/**
 * Stored key for an uploaded file: "r2:<folder>/<name>" when moved to R2,
 * otherwise the local relative key (e.g. "documents/123-abc.pdf").
 */
export const storageKeyFor = (file) => file.storageKey || `${path.basename(path.dirname(file.path))}/${file.filename}`;

/**
 * URL to store for an uploaded file. Images: the public R2 URL or
 * /uploads/images/... (local). Private files keep their storage key and are
 * served through access-checked API endpoints.
 */
export const publicUrlFor = (file) => {
  if (file.publicUrl) return file.publicUrl;
  if (file.storageKey) return file.storageKey;
  return `/uploads/${storageKeyFor(file)}`;
};

export default { uploadImage, uploadVideo, uploadDocument, uploadProject, storageKeyFor, publicUrlFor };
