-- ============================================================
-- 008 - WooCommerce product sync state on courses
-- A paid course created in the LMS creates a draft WooCommerce product; from
-- then on WooCommerce owns the product (price, sale price, publishing) and the
-- LMS mirrors it here:
--   woocommerce_product_status  publish | draft | pending | private | trash | missing
--   woocommerce_product_url     product page (permalink) on the store
--   woocommerce_synced_at       last successful read from the store
--   woocommerce_sync_error      last sync problem shown to admins (NULL = OK)
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'woocommerce_product_status');
SET @ddl := IF(@has = 0, 'ALTER TABLE courses ADD COLUMN woocommerce_product_status VARCHAR(20) NULL AFTER woocommerce_product_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'woocommerce_product_url');
SET @ddl := IF(@has = 0, 'ALTER TABLE courses ADD COLUMN woocommerce_product_url VARCHAR(500) NULL AFTER woocommerce_product_status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'woocommerce_synced_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE courses ADD COLUMN woocommerce_synced_at DATETIME NULL AFTER woocommerce_product_url', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'woocommerce_sync_error');
SET @ddl := IF(@has = 0, 'ALTER TABLE courses ADD COLUMN woocommerce_sync_error VARCHAR(255) NULL AFTER woocommerce_synced_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
