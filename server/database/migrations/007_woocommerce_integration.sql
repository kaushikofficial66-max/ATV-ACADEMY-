-- ============================================================
-- 007 - WooCommerce integration (antarikshtv.com is the commerce source of truth)
-- courses.woocommerce_product_id : permanent WooCommerce product -> LMS course mapping
-- users.woocommerce_customer_id  : WooCommerce customer reference (not unique: a
--                                  customer may change email; email is the match key)
-- orders.*                        : LMS orders can mirror a WooCommerce order
--   source                 lms | woocommerce
--   woocommerce_order_id   unique -> webhook retries never create a second order
--   woocommerce_status     raw WooCommerce status (processing, on-hold, ...)
--   woocommerce_modified_at  date_modified of the last applied payload; older
--                          (out-of-order / replayed) payloads are ignored
--   coupon_codes           WooCommerce coupon codes applied (informational)
--   sync_note              last sync warning (unmapped product, partial refund...)
-- Payments reuse payment_gateway='woocommerce', gateway_order_id, gateway_payment_id
-- (transaction id) and payment_method; enrollments reach the WooCommerce order via
-- enrollments.order_id. Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

-- courses.woocommerce_product_id
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'woocommerce_product_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE courses ADD COLUMN woocommerce_product_id BIGINT UNSIGNED NULL AFTER discount_price', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'courses' AND INDEX_NAME = 'uq_courses_woocommerce_product');
SET @ddl := IF(@has = 0, 'CREATE UNIQUE INDEX uq_courses_woocommerce_product ON courses (woocommerce_product_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.woocommerce_customer_id
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'woocommerce_customer_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE users ADD COLUMN woocommerce_customer_id BIGINT UNSIGNED NULL AFTER phone', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_woocommerce_customer');
SET @ddl := IF(@has = 0, 'CREATE INDEX idx_users_woocommerce_customer ON users (woocommerce_customer_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.source
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'source');
SET @ddl := IF(@has = 0, "ALTER TABLE orders ADD COLUMN source ENUM('lms','woocommerce') NOT NULL DEFAULT 'lms' AFTER order_number", 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.woocommerce_order_id (+ unique)
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'woocommerce_order_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN woocommerce_order_id BIGINT UNSIGNED NULL AFTER source', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_woocommerce_order');
SET @ddl := IF(@has = 0, 'CREATE UNIQUE INDEX uq_orders_woocommerce_order ON orders (woocommerce_order_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.woocommerce_status
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'woocommerce_status');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN woocommerce_status VARCHAR(30) NULL AFTER status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.woocommerce_modified_at
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'woocommerce_modified_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN woocommerce_modified_at DATETIME NULL AFTER woocommerce_status', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.coupon_codes
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'coupon_codes');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN coupon_codes VARCHAR(255) NULL AFTER coupon_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orders.sync_note
SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'sync_note');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN sync_note VARCHAR(500) NULL AFTER woocommerce_modified_at', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'idx_orders_source');
SET @ddl := IF(@has = 0, 'CREATE INDEX idx_orders_source ON orders (source)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
