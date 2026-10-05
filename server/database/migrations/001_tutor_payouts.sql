-- ============================================================
-- 001 - Tutor payouts (additive; required for Tutor > Earnings > Payout History)
-- The base 45-table schema has no table to record money paid out to tutors.
-- Earnings themselves are computed from paid order_items; this table only
-- records payouts that admins have made against those earnings.
-- ============================================================
CREATE TABLE IF NOT EXISTS tutor_payouts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 tutor_id BIGINT UNSIGNED NOT NULL,
 amount DECIMAL(10,2) NOT NULL,
 currency VARCHAR(10) NOT NULL DEFAULT 'INR',
 period_start DATE, period_end DATE,
 payout_method VARCHAR(50), transaction_reference VARCHAR(255), note TEXT,
 status ENUM('pending','processing','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
 paid_at DATETIME, created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_tutor_payouts_tutor(tutor_id), INDEX idx_tutor_payouts_status(status),
 CONSTRAINT fk_tutor_payouts_tutor FOREIGN KEY(tutor_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_tutor_payouts_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
