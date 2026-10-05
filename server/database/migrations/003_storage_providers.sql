-- ============================================================
-- 003 - files.storage_provider: Vimeo + Cloudflare R2
-- Videos are stored on Vimeo, every other file on Cloudflare R2 (or local
-- disk in development). AWS S3 / Cloudflare Stream are not used; any such
-- rows (none expected) are kept as 'local' metadata. Safe to re-run.
-- ============================================================
ALTER TABLE files MODIFY COLUMN storage_provider
  ENUM('local','s3','gcs','cloudinary','cloudflare_r2','cloudflare_stream','vimeo') NOT NULL DEFAULT 'local';
UPDATE files SET storage_provider = 'local' WHERE storage_provider IN ('s3','cloudflare_stream');
ALTER TABLE files MODIFY COLUMN storage_provider
  ENUM('local','cloudflare_r2','vimeo','gcs','cloudinary') NOT NULL DEFAULT 'local';
