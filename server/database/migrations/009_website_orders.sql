-- ============================================================
-- 009 - Orders placed directly on the marketing website (antarikshtv.com)
-- The website takes the Razorpay payment itself, stores the order/payment, then
-- pushes the paid order to POST /webhooks/atv-site (HMAC signed).
-- orders.source               adds 'website'
-- orders.external_order_id    the website's own order id (e.g. ATV-1042); unique ->
--                             retries / replays never create a second order
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

ALTER TABLE orders MODIFY COLUMN source ENUM('lms','woocommerce','website') NOT NULL DEFAULT 'lms';

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'external_order_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN external_order_id VARCHAR(64) NULL AFTER woocommerce_order_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_external_order');
SET @ddl := IF(@has = 0, 'CREATE UNIQUE INDEX uq_orders_external_order ON orders (external_order_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
