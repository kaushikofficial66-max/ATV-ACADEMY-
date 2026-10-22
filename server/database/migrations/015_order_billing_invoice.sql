-- ============================================================
-- 015 - Billing details (state / city / pincode) and GST invoices on orders
-- orders.billing_*        taken from the WooCommerce checkout (needed for the GST invoice)
-- orders.invoice_number   e.g. ATV/2627/0001 (unique, sequential per financial year)
-- orders.invoice_sent_at  set once the invoice email went out (never sent twice)
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_name');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN billing_name VARCHAR(200) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_state');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN billing_state VARCHAR(100) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_state_code');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN billing_state_code VARCHAR(5) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_city');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN billing_city VARCHAR(100) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'billing_postcode');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN billing_postcode VARCHAR(12) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'invoice_number');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN invoice_number VARCHAR(40) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'invoice_issued_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN invoice_issued_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'invoice_sent_at');
SET @ddl := IF(@has = 0, 'ALTER TABLE orders ADD COLUMN invoice_sent_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_invoice_number');
SET @ddl := IF(@has = 0, 'CREATE UNIQUE INDEX uq_orders_invoice_number ON orders (invoice_number)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
