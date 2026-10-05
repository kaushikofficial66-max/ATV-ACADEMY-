-- ============================================================
-- 002 - recorded_videos: Vimeo video id
-- Recorded videos are stored on Vimeo; vimeo_video_id holds the numeric
-- Vimeo id. The earlier cloudflare_video_id column (Cloudflare Stream) is
-- removed only when it holds no data. Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recorded_videos' AND COLUMN_NAME = 'vimeo_video_id');
SET @ddl := IF(@has_col = 0, 'ALTER TABLE recorded_videos ADD COLUMN vimeo_video_id VARCHAR(32) NULL AFTER status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recorded_videos' AND INDEX_NAME = 'idx_recorded_videos_vimeo');
SET @ddl := IF(@has_idx = 0, 'CREATE INDEX idx_recorded_videos_vimeo ON recorded_videos (vimeo_video_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Remove the unused Cloudflare Stream column (only if it exists and is empty).
SET @cf_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recorded_videos' AND COLUMN_NAME = 'cloudflare_video_id');
SET @cf_used := IF(@cf_col = 0, 1, NULL);
SET @sql := IF(@cf_col = 0, 'SELECT 1 INTO @cf_used',
  'SELECT COUNT(*) INTO @cf_used FROM recorded_videos WHERE cloudflare_video_id IS NOT NULL');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @cf_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recorded_videos' AND INDEX_NAME = 'idx_recorded_videos_cloudflare');
SET @ddl := IF(@cf_col = 1 AND @cf_used = 0 AND @cf_idx > 0, 'DROP INDEX idx_recorded_videos_cloudflare ON recorded_videos', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(@cf_col = 1 AND @cf_used = 0, 'ALTER TABLE recorded_videos DROP COLUMN cloudflare_video_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
