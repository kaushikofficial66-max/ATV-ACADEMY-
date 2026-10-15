-- ============================================================
-- 012 - Store plans: ONE WooCommerce product that unlocks SEVERAL courses
-- (Essential = Premiere Pro, Pro = Premiere Pro + Photoshop, Complete = + After Effects & AI ...)
--
-- courses.woocommerce_product_id stays the 1 product -> 1 course link (and keeps syncing price / status).
-- A store plan is a separate thing: its own WooCommerce product (the plan the buyer pays for) mapped to
-- a list of courses. When an order contains that product the buyer is enrolled in every listed course
-- and the plan price is split between them (revenue_weight) so course revenue / tutor earnings stay correct.
--
-- store_plans.slug  matches the plan slugs on the website plugin (essential / pro / complete) so the
--                   website can find the plan's product from the portal.
-- Safe to re-run (MySQL 8 / MariaDB).
-- ============================================================

CREATE TABLE IF NOT EXISTS store_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  description VARCHAR(500) NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  woocommerce_product_id BIGINT UNSIGNED NULL,
  woocommerce_product_status VARCHAR(20) NULL,
  woocommerce_sync_error VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_plans_slug (slug),
  UNIQUE KEY uq_store_plans_product (woocommerce_product_id),
  INDEX idx_store_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS store_plan_courses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_id BIGINT UNSIGNED NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  revenue_weight DECIMAL(8,2) NOT NULL DEFAULT 1.00,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_store_plan_course (plan_id, course_id),
  INDEX idx_store_plan_courses_course (course_id),
  CONSTRAINT fk_store_plan_courses_plan FOREIGN KEY (plan_id) REFERENCES store_plans (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_store_plan_courses_course FOREIGN KEY (course_id) REFERENCES courses (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
