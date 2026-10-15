-- Upgrade prices between store plans.
-- A student who owns the Essential plan and upgrades to Pro pays (Pro price - Essential price) automatically.
-- A row here OVERRIDES that automatic price for one pair (from_plan_id -> to_plan_id).
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS store_plan_upgrades (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  from_plan_id BIGINT UNSIGNED NOT NULL,
  to_plan_id BIGINT UNSIGNED NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_plan_upgrade (from_plan_id, to_plan_id),
  INDEX idx_store_plan_upgrades_to (to_plan_id),
  CONSTRAINT fk_store_plan_upgrades_from FOREIGN KEY (from_plan_id) REFERENCES store_plans (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_store_plan_upgrades_to FOREIGN KEY (to_plan_id) REFERENCES store_plans (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
