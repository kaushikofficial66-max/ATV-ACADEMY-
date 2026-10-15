-- ============================================================
-- 010 - Automatic Zoom recording -> Vimeo for live classes
-- live_classes.recording_status
--     none       no auto-recording (manual Zoom link, or the feature is off)
--     pending    Zoom meeting created with cloud recording; waiting for the class to end + Zoom to finish processing
--     uploading  the server is copying the recording from Zoom to Vimeo right now
--     uploaded   the recording is on Vimeo (recorded_videos row = recording_video_id)
--     failed     gave up after several attempts (see recording_error)
-- live_classes.recording_video_id    first recorded_videos row created from the recording
-- live_classes.recording_attempts    failed attempts so far
-- live_classes.recording_error       last problem, for the admin / tutor
-- live_classes.recording_checked_at  last time Zoom was asked (also marks the start of an upload)
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'recording_status');
SET @ddl := IF(@has = 0, "ALTER TABLE live_classes ADD COLUMN recording_status ENUM('none','pending','uploading','uploaded','failed') NOT NULL DEFAULT 'none' AFTER status", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'recording_video_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN recording_video_id BIGINT UNSIGNED NULL AFTER recording_status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'recording_attempts');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN recording_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER recording_video_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'recording_error');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN recording_error VARCHAR(500) NULL AFTER recording_attempts', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'recording_checked_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN recording_checked_at DATETIME NULL AFTER recording_error', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND INDEX_NAME = 'idx_live_classes_recording');
SET @ddl := IF(@has = 0, 'CREATE INDEX idx_live_classes_recording ON live_classes (recording_status)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
