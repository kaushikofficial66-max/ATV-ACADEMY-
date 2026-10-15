-- ============================================================
-- 011 - Live classes belong to a module (topic) of the course
-- live_classes.section_id   the module the class is placed in (chosen when scheduling)
-- live_classes.lecture_id   the "live class" lecture created in that module; students see it in the
--                           module list with a LIVE badge, and the recording is attached to it
-- Both nullable: older classes keep working (their recordings go to the hidden
-- "Live class recordings" module). No foreign keys on purpose - a deleted lecture just leaves a stale id,
-- which the code ignores.
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'section_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN section_id BIGINT UNSIGNED NULL AFTER course_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND COLUMN_NAME = 'lecture_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE live_classes ADD COLUMN lecture_id BIGINT UNSIGNED NULL AFTER section_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'live_classes' AND INDEX_NAME = 'idx_live_classes_lecture');
SET @ddl := IF(@has = 0, 'CREATE INDEX idx_live_classes_lecture ON live_classes (lecture_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
