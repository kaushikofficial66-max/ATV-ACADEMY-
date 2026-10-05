-- ============================================================
-- 005 - live_class_tutors
-- A live class can be assigned to one or more tutors of its course.
-- live_classes.tutor_id stays the host; every assigned tutor (host included)
-- has a row here. Existing classes get their host backfilled. Safe to re-run.
-- ============================================================
CREATE TABLE IF NOT EXISTS live_class_tutors (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 live_class_id BIGINT UNSIGNED NOT NULL,
 tutor_id BIGINT UNSIGNED NOT NULL,
 is_host TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_live_class_tutor(live_class_id, tutor_id),
 INDEX idx_live_class_tutors_tutor(tutor_id),
 CONSTRAINT fk_live_class_tutors_class FOREIGN KEY(live_class_id) REFERENCES live_classes(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_live_class_tutors_tutor FOREIGN KEY(tutor_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO live_class_tutors (live_class_id, tutor_id, is_host)
SELECT id, tutor_id, 1 FROM live_classes WHERE tutor_id IS NOT NULL;
