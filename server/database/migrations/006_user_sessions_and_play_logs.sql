-- ============================================================
-- 006 - user_sessions + video_play_logs (activity & device tracking)
-- user_sessions: one row per login (device, OS, browser, IP), refreshed while
--   the user is active (last_seen_at) and closed on logout (logout_at).
-- video_play_logs: every recorded-video play with the device it happened on,
--   so admins can see whether a student watches on mobile, tablet or desktop.
-- Safe to re-run.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 session_key CHAR(36) NOT NULL,
 device_type ENUM('mobile','tablet','desktop','unknown') NOT NULL DEFAULT 'unknown',
 os VARCHAR(50),
 browser VARCHAR(50),
 ip_address VARCHAR(45),
 user_agent VARCHAR(500),
 login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 logout_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_user_sessions_key(session_key),
 INDEX idx_user_sessions_user(user_id, login_at),
 CONSTRAINT fk_user_sessions_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_play_logs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 course_id BIGINT UNSIGNED NOT NULL,
 video_id BIGINT UNSIGNED NOT NULL,
 lecture_id BIGINT UNSIGNED NULL,
 device_type ENUM('mobile','tablet','desktop','unknown') NOT NULL DEFAULT 'unknown',
 os VARCHAR(50),
 browser VARCHAR(50),
 played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_video_play_logs_user(user_id, played_at),
 INDEX idx_video_play_logs_course(course_id),
 CONSTRAINT fk_video_play_logs_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_video_play_logs_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
