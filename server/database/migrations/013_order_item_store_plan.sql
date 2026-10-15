-- ============================================================
-- 013 - Remember which store plan an order item came from
-- order_items.store_plan_id   set by the WooCommerce order sync when the line was a PLAN product
--                             (Essential / Pro / Complete). The portal uses it to know which students
--                             bought a plan, so it can show them the courses of the other plans as locked
--                             ("Included in the Pro plan") with a button to buy them.
-- Nullable, no foreign key on purpose: deleting a plan keeps the order history intact.
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

SET @has := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'store_plan_id');
SET @ddl := IF(@has = 0, 'ALTER TABLE order_items ADD COLUMN store_plan_id BIGINT UNSIGNED NULL AFTER course_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_store_plan');
SET @ddl := IF(@has = 0, 'CREATE INDEX idx_order_items_store_plan ON order_items (store_plan_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
