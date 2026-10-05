-- ============================================================
-- 004 - progress_activities (90% completion rule)
-- Course progress grows by a fixed increment each time a student plays a
-- recorded video or joins a live class, capped at 90%. Each counted click is
-- stored here (audit trail + de-duplication); the sum of increment_percent per
-- enrollment is the student's automatic progress. 90% -> 100% only happens when
-- the final project is approved. Safe to re-run.
-- ============================================================
CREATE TABLE IF NOT EXISTS progress_activities (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL,
 course_id BIGINT UNSIGNED NOT NULL,
 activity_type ENUM('video_play','live_class_join') NOT NULL,
 reference_id BIGINT UNSIGNED,
 increment_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 progress_after DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_progress_activities_enrollment(enrollment_id, created_at),
 INDEX idx_progress_activities_ref(enrollment_id, activity_type, reference_id),
 INDEX idx_progress_activities_user(user_id),
 INDEX idx_progress_activities_course(course_id),
 CONSTRAINT fk_progress_activities_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_progress_activities_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_progress_activities_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
