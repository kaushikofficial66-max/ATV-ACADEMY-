-- ============================================================
-- COMPLETE LMS DATABASE - MySQL 8.0+
-- 45 tables | Student | Tutor | Admin
-- Usage: mysql -u root -p < database/schema.sql
--        then: mysql -u root -p lms_db < database/migrations/001_tutor_payouts.sql
--        then: npm run seed
-- ============================================================
CREATE DATABASE IF NOT EXISTS lms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lms_db;
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS report_exports, files, settings, cms_contents, cms_pages,
communications, notifications, community_likes, community_comments, community_posts,
reviews, wishlists, coupon_usages, payments, order_items, orders, cart_items, carts,
live_class_participants, live_classes, certificates, project_submissions, projects,
quiz_attempt_answers, quiz_attempts, quiz_answers, quiz_questions, quizzes,
course_progress, lecture_progress, enrollments, video_progress, recorded_videos,
course_resources, lectures, course_sections, course_tutors, courses, categories,
email_verifications, password_resets, user_profiles, users, coupons, roles;

CREATE TABLE roles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(50) NOT NULL UNIQUE,
 description VARCHAR(255),
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 role_id BIGINT UNSIGNED NOT NULL,
 first_name VARCHAR(100) NOT NULL,
 last_name VARCHAR(100),
 email VARCHAR(150) NOT NULL UNIQUE,
 phone VARCHAR(20) UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 profile_image VARCHAR(500),
 email_verified_at DATETIME,
 phone_verified_at DATETIME,
 status ENUM('active','inactive','blocked','pending') NOT NULL DEFAULT 'pending',
 last_login_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_users_role_id(role_id), INDEX idx_users_status(status),
 CONSTRAINT fk_users_role FOREIGN KEY(role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_profiles (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL UNIQUE,
 bio TEXT, date_of_birth DATE, gender VARCHAR(30), address TEXT,
 city VARCHAR(100), state VARCHAR(100), country VARCHAR(100), postal_code VARCHAR(20),
 website VARCHAR(255), linkedin_url VARCHAR(255),
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_user_profiles_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_resets (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 token VARCHAR(255) NOT NULL UNIQUE,
 expires_at DATETIME NOT NULL, used_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_password_resets_user(user_id), INDEX idx_password_resets_expires(expires_at),
 CONSTRAINT fk_password_resets_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_verifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 token VARCHAR(255) NOT NULL UNIQUE,
 expires_at DATETIME NOT NULL, verified_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_email_verifications_user(user_id), INDEX idx_email_verifications_expires(expires_at),
 CONSTRAINT fk_email_verifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(150) NOT NULL UNIQUE, slug VARCHAR(180) NOT NULL UNIQUE,
 description TEXT, image_url VARCHAR(500),
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_categories_status(status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE courses (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 category_id BIGINT UNSIGNED NOT NULL, created_by BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, slug VARCHAR(300) NOT NULL UNIQUE,
 short_description TEXT, description LONGTEXT, thumbnail_url VARCHAR(500),
 price DECIMAL(10,2) NOT NULL DEFAULT 0.00, discount_price DECIMAL(10,2),
 duration_minutes INT UNSIGNED, level ENUM('beginner','intermediate','advanced','all') NOT NULL DEFAULT 'all',
 language VARCHAR(50) NOT NULL DEFAULT 'English',
 status ENUM('draft','pending','approved','published','rejected','archived') NOT NULL DEFAULT 'draft',
 approval_note TEXT, approved_by BIGINT UNSIGNED, approved_at DATETIME, published_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_courses_category(category_id), INDEX idx_courses_created_by(created_by),
 INDEX idx_courses_approved_by(approved_by), INDEX idx_courses_status(status),
 CONSTRAINT fk_courses_category FOREIGN KEY(category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_courses_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_courses_approved_by FOREIGN KEY(approved_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_tutors (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, tutor_id BIGINT UNSIGNED NOT NULL,
 is_primary BOOLEAN NOT NULL DEFAULT FALSE,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_course_tutor(course_id,tutor_id), INDEX idx_course_tutors_tutor(tutor_id),
 CONSTRAINT fk_course_tutors_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_course_tutors_tutor FOREIGN KEY(tutor_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_sections (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL, description TEXT,
 sort_order INT NOT NULL DEFAULT 0, status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_course_sections_course(course_id), INDEX idx_course_sections_sort(course_id,sort_order),
 CONSTRAINT fk_course_sections_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lectures (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 section_id BIGINT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL, description TEXT,
 lecture_type ENUM('video','text','document','quiz','live_class') NOT NULL DEFAULT 'video',
 sort_order INT NOT NULL DEFAULT 0, is_preview BOOLEAN NOT NULL DEFAULT FALSE,
 duration_seconds INT UNSIGNED, status ENUM('draft','published','inactive') NOT NULL DEFAULT 'draft',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_lectures_section(section_id), INDEX idx_lectures_sort(section_id,sort_order), INDEX idx_lectures_status(status),
 CONSTRAINT fk_lectures_section FOREIGN KEY(section_id) REFERENCES course_sections(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_resources (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED, uploaded_by BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, file_name VARCHAR(255) NOT NULL, file_url VARCHAR(1000) NOT NULL,
 file_type VARCHAR(100), file_size BIGINT UNSIGNED, status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_course_resources_course(course_id), INDEX idx_course_resources_lecture(lecture_id), INDEX idx_course_resources_uploaded_by(uploaded_by),
 CONSTRAINT fk_course_resources_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_course_resources_lecture FOREIGN KEY(lecture_id) REFERENCES lectures(id) ON UPDATE CASCADE ON DELETE SET NULL,
 CONSTRAINT fk_course_resources_uploaded_by FOREIGN KEY(uploaded_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recorded_videos (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, section_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED,
 uploaded_by BIGINT UNSIGNED NOT NULL, title VARCHAR(255) NOT NULL, description TEXT,
 video_url VARCHAR(1000) NOT NULL, storage_key VARCHAR(500), thumbnail_url VARCHAR(1000),
 duration_seconds INT UNSIGNED, file_size BIGINT UNSIGNED, mime_type VARCHAR(100), sort_order INT NOT NULL DEFAULT 0,
 status ENUM('processing','ready','failed','published','unpublished','deleted') NOT NULL DEFAULT 'processing',
 vimeo_video_id VARCHAR(32),
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_recorded_videos_course(course_id), INDEX idx_recorded_videos_section(section_id),
 INDEX idx_recorded_videos_lecture(lecture_id), INDEX idx_recorded_videos_uploaded_by(uploaded_by), INDEX idx_recorded_videos_status(status), INDEX idx_recorded_videos_vimeo(vimeo_video_id),
 CONSTRAINT fk_recorded_videos_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_recorded_videos_section FOREIGN KEY(section_id) REFERENCES course_sections(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_recorded_videos_lecture FOREIGN KEY(lecture_id) REFERENCES lectures(id) ON UPDATE CASCADE ON DELETE SET NULL,
 CONSTRAINT fk_recorded_videos_uploaded_by FOREIGN KEY(uploaded_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE video_progress (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL, video_id BIGINT UNSIGNED NOT NULL,
 watched_seconds INT UNSIGNED NOT NULL DEFAULT 0, completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 last_position_seconds INT UNSIGNED NOT NULL DEFAULT 0, completed BOOLEAN NOT NULL DEFAULT FALSE, completed_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_video_progress_user_video(user_id,video_id), INDEX idx_video_progress_video(video_id),
 CONSTRAINT fk_video_progress_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_video_progress_video FOREIGN KEY(video_id) REFERENCES recorded_videos(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE enrollments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL, order_id BIGINT UNSIGNED,
 enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at DATETIME,
 status ENUM('active','completed','cancelled','expired') NOT NULL DEFAULT 'active',
 completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00, completed_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_enrollment_user_course(user_id,course_id), INDEX idx_enrollments_course(course_id), INDEX idx_enrollments_status(status), INDEX idx_enrollments_order(order_id),
 CONSTRAINT fk_enrollments_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_enrollments_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE lecture_progress (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL, lecture_id BIGINT UNSIGNED NOT NULL, enrollment_id BIGINT UNSIGNED NOT NULL,
 watched_seconds INT UNSIGNED NOT NULL DEFAULT 0, completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 completed BOOLEAN NOT NULL DEFAULT FALSE, completed_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_lecture_progress_user_lecture(user_id,lecture_id), INDEX idx_lecture_progress_enrollment(enrollment_id),
 CONSTRAINT fk_lecture_progress_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_lecture_progress_lecture FOREIGN KEY(lecture_id) REFERENCES lectures(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_lecture_progress_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE course_progress (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 enrollment_id BIGINT UNSIGNED NOT NULL UNIQUE, total_lectures INT UNSIGNED NOT NULL DEFAULT 0,
 completed_lectures INT UNSIGNED NOT NULL DEFAULT 0, completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 last_lecture_id BIGINT UNSIGNED, completed_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_course_progress_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_course_progress_last_lecture FOREIGN KEY(last_lecture_id) REFERENCES lectures(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quizzes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 course_id BIGINT UNSIGNED NOT NULL, section_id BIGINT UNSIGNED, lecture_id BIGINT UNSIGNED, created_by BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, description TEXT, passing_marks DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 total_marks DECIMAL(5,2) NOT NULL DEFAULT 0.00, time_limit_minutes INT UNSIGNED, max_attempts INT UNSIGNED,
 status ENUM('draft','published','inactive') NOT NULL DEFAULT 'draft',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_quizzes_course(course_id), INDEX idx_quizzes_section(section_id), INDEX idx_quizzes_lecture(lecture_id), INDEX idx_quizzes_created_by(created_by),
 CONSTRAINT fk_quizzes_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_quizzes_section FOREIGN KEY(section_id) REFERENCES course_sections(id) ON UPDATE CASCADE ON DELETE SET NULL,
 CONSTRAINT fk_quizzes_lecture FOREIGN KEY(lecture_id) REFERENCES lectures(id) ON UPDATE CASCADE ON DELETE SET NULL,
 CONSTRAINT fk_quizzes_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quiz_questions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, quiz_id BIGINT UNSIGNED NOT NULL, question TEXT NOT NULL,
 question_type ENUM('single','multiple','true_false') NOT NULL DEFAULT 'single', marks DECIMAL(5,2) NOT NULL DEFAULT 1.00,
 sort_order INT NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_quiz_questions_quiz(quiz_id), INDEX idx_quiz_questions_sort(quiz_id,sort_order),
 CONSTRAINT fk_quiz_questions_quiz FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quiz_answers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, question_id BIGINT UNSIGNED NOT NULL, answer_text TEXT NOT NULL,
 is_correct BOOLEAN NOT NULL DEFAULT FALSE, sort_order INT NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_quiz_answers_question(question_id),
 CONSTRAINT fk_quiz_answers_question FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quiz_attempts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, quiz_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 enrollment_id BIGINT UNSIGNED NOT NULL, attempt_number INT UNSIGNED NOT NULL,
 started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at DATETIME,
 score DECIMAL(5,2) NOT NULL DEFAULT 0.00, percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 passed BOOLEAN NOT NULL DEFAULT FALSE, status ENUM('started','submitted','expired') NOT NULL DEFAULT 'started',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_quiz_attempt_number(quiz_id,user_id,attempt_number), INDEX idx_quiz_attempts_user(user_id), INDEX idx_quiz_attempts_enrollment(enrollment_id),
 CONSTRAINT fk_quiz_attempts_quiz FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_quiz_attempts_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_quiz_attempts_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quiz_attempt_answers (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, attempt_id BIGINT UNSIGNED NOT NULL, question_id BIGINT UNSIGNED NOT NULL,
 answer_id BIGINT UNSIGNED, answer_text TEXT, is_correct BOOLEAN NOT NULL DEFAULT FALSE, marks_obtained DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_attempt_answers_attempt(attempt_id), INDEX idx_attempt_answers_question(question_id), INDEX idx_attempt_answers_answer(answer_id),
 CONSTRAINT fk_attempt_answers_attempt FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_attempt_answers_question FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_attempt_answers_answer FOREIGN KEY(answer_id) REFERENCES quiz_answers(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, course_id BIGINT UNSIGNED NOT NULL, created_by BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, instructions LONGTEXT, max_file_size BIGINT UNSIGNED, allowed_file_types JSON,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_projects_course(course_id), INDEX idx_projects_created_by(created_by),
 CONSTRAINT fk_projects_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_projects_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_submissions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, student_id BIGINT UNSIGNED NOT NULL,
 enrollment_id BIGINT UNSIGNED NOT NULL, file_url VARCHAR(1000) NOT NULL, file_name VARCHAR(255) NOT NULL,
 file_size BIGINT UNSIGNED, submission_note TEXT,
 status ENUM('submitted','under_review','approved','rejected','resubmission_required') NOT NULL DEFAULT 'submitted',
 tutor_feedback TEXT, reviewed_by BIGINT UNSIGNED, reviewed_at DATETIME,
 submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_project_submissions_project(project_id), INDEX idx_project_submissions_student(student_id), INDEX idx_project_submissions_enrollment(enrollment_id), INDEX idx_project_submissions_reviewer(reviewed_by), INDEX idx_project_submissions_status(status),
 CONSTRAINT fk_project_submissions_project FOREIGN KEY(project_id) REFERENCES projects(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_project_submissions_student FOREIGN KEY(student_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_project_submissions_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_project_submissions_reviewer FOREIGN KEY(reviewed_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE certificates (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, certificate_number VARCHAR(100) NOT NULL UNIQUE,
 user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL, enrollment_id BIGINT UNSIGNED NOT NULL UNIQUE,
 approved_by BIGINT UNSIGNED, certificate_url VARCHAR(1000), issue_date DATE,
 status ENUM('pending','approved','issued','revoked') NOT NULL DEFAULT 'pending',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_certificates_user(user_id), INDEX idx_certificates_course(course_id), INDEX idx_certificates_approved_by(approved_by), INDEX idx_certificates_status(status),
 CONSTRAINT fk_certificates_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_certificates_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_certificates_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_certificates_approved_by FOREIGN KEY(approved_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE live_classes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, course_id BIGINT UNSIGNED NOT NULL, tutor_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, description TEXT, scheduled_start DATETIME NOT NULL, scheduled_end DATETIME NOT NULL,
 timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Kolkata', zoom_meeting_id VARCHAR(100), zoom_join_url VARCHAR(1000),
 zoom_start_url VARCHAR(1000), password VARCHAR(255), status ENUM('scheduled','live','completed','cancelled') NOT NULL DEFAULT 'scheduled',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_live_classes_course(course_id), INDEX idx_live_classes_tutor(tutor_id), INDEX idx_live_classes_schedule(scheduled_start), INDEX idx_live_classes_status(status),
 CONSTRAINT fk_live_classes_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_live_classes_tutor FOREIGN KEY(tutor_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE live_class_participants (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, live_class_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 joined_at DATETIME, left_at DATETIME, attendance_status ENUM('registered','joined','absent') NOT NULL DEFAULT 'registered',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_live_class_participant(live_class_id,user_id), INDEX idx_live_class_participants_user(user_id),
 CONSTRAINT fk_live_class_participants_class FOREIGN KEY(live_class_id) REFERENCES live_classes(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_live_class_participants_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE carts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 status ENUM('active','converted','abandoned') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_carts_user(user_id), INDEX idx_carts_status(status),
 CONSTRAINT fk_carts_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cart_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, cart_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
 price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cart_course(cart_id,course_id), INDEX idx_cart_items_course(course_id),
 CONSTRAINT fk_cart_items_cart FOREIGN KEY(cart_id) REFERENCES carts(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_cart_items_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupons (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, code VARCHAR(50) NOT NULL UNIQUE, description VARCHAR(255),
 discount_type ENUM('percentage','fixed') NOT NULL, discount_value DECIMAL(10,2) NOT NULL,
 minimum_order_amount DECIMAL(10,2), maximum_discount DECIMAL(10,2), usage_limit INT UNSIGNED, usage_count INT UNSIGNED NOT NULL DEFAULT 0,
 start_at DATETIME NOT NULL, expires_at DATETIME NOT NULL,
 status ENUM('active','inactive','expired') NOT NULL DEFAULT 'active', created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_coupons_status(status), INDEX idx_coupons_dates(start_at,expires_at), INDEX idx_coupons_created_by(created_by),
 CONSTRAINT fk_coupons_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 order_number VARCHAR(100) NOT NULL UNIQUE, subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00, tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00, currency VARCHAR(10) NOT NULL DEFAULT 'INR', coupon_id BIGINT UNSIGNED,
 status ENUM('pending','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'pending',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_orders_user(user_id), INDEX idx_orders_coupon(coupon_id), INDEX idx_orders_status(status),
 CONSTRAINT fk_orders_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_orders_coupon FOREIGN KEY(coupon_id) REFERENCES coupons(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
 course_title VARCHAR(255) NOT NULL, price DECIMAL(10,2) NOT NULL, discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 final_amount DECIMAL(10,2) NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_order_items_order(order_id), INDEX idx_order_items_course(course_id),
 CONSTRAINT fk_order_items_order FOREIGN KEY(order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_order_items_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 payment_gateway VARCHAR(50) NOT NULL, gateway_order_id VARCHAR(255), gateway_payment_id VARCHAR(255), gateway_signature VARCHAR(500),
 amount DECIMAL(10,2) NOT NULL, currency VARCHAR(10) NOT NULL DEFAULT 'INR',
 status ENUM('created','pending','success','failed','refunded') NOT NULL DEFAULT 'created',
 payment_method VARCHAR(50), paid_at DATETIME, raw_response JSON,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_payments_order(order_id), INDEX idx_payments_user(user_id), INDEX idx_payments_gateway_order(gateway_order_id), INDEX idx_payments_gateway_payment(gateway_payment_id), INDEX idx_payments_status(status),
 CONSTRAINT fk_payments_order FOREIGN KEY(order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_payments_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE coupon_usages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, coupon_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 order_id BIGINT UNSIGNED NOT NULL, discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_coupon_usage_order(coupon_id,order_id), INDEX idx_coupon_usages_user(user_id), INDEX idx_coupon_usages_order(order_id),
 CONSTRAINT fk_coupon_usages_coupon FOREIGN KEY(coupon_id) REFERENCES coupons(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_coupon_usages_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_coupon_usages_order FOREIGN KEY(order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE wishlists (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_wishlist_user_course(user_id,course_id),
 CONSTRAINT fk_wishlists_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_wishlists_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reviews (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, course_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 enrollment_id BIGINT UNSIGNED NOT NULL, rating TINYINT UNSIGNED NOT NULL, review TEXT,
 status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending', moderated_by BIGINT UNSIGNED, moderated_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_review_user_course(user_id,course_id), INDEX idx_reviews_course(course_id), INDEX idx_reviews_status(status), INDEX idx_reviews_moderated_by(moderated_by),
 CONSTRAINT fk_reviews_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_reviews_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_reviews_enrollment FOREIGN KEY(enrollment_id) REFERENCES enrollments(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_reviews_moderated_by FOREIGN KEY(moderated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
 CONSTRAINT chk_reviews_rating CHECK(rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_posts (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL, course_id BIGINT UNSIGNED,
 content TEXT NOT NULL, attachment_url VARCHAR(1000), status ENUM('published','hidden','deleted','pending') NOT NULL DEFAULT 'published',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_community_posts_user(user_id), INDEX idx_community_posts_course(course_id), INDEX idx_community_posts_status(status), INDEX idx_community_posts_created(created_at),
 CONSTRAINT fk_community_posts_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_community_posts_course FOREIGN KEY(course_id) REFERENCES courses(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_comments (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 parent_comment_id BIGINT UNSIGNED, content TEXT NOT NULL,
 status ENUM('visible','hidden','deleted') NOT NULL DEFAULT 'visible',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_community_comments_post(post_id), INDEX idx_community_comments_user(user_id), INDEX idx_community_comments_parent(parent_comment_id),
 CONSTRAINT fk_community_comments_post FOREIGN KEY(post_id) REFERENCES community_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_community_comments_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_community_comments_parent FOREIGN KEY(parent_comment_id) REFERENCES community_comments(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE community_likes (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, post_id BIGINT UNSIGNED NOT NULL, user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_community_like(post_id,user_id),
 CONSTRAINT fk_community_likes_post FOREIGN KEY(post_id) REFERENCES community_posts(id) ON UPDATE CASCADE ON DELETE CASCADE,
 CONSTRAINT fk_community_likes_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
 title VARCHAR(255) NOT NULL, message TEXT NOT NULL, type VARCHAR(50) NOT NULL,
 reference_type VARCHAR(50), reference_id BIGINT UNSIGNED, is_read BOOLEAN NOT NULL DEFAULT FALSE, read_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_notifications_user(user_id), INDEX idx_notifications_read(user_id,is_read), INDEX idx_notifications_reference(reference_type,reference_id),
 CONSTRAINT fk_notifications_user FOREIGN KEY(user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE communications (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sender_id BIGINT UNSIGNED NOT NULL, recipient_id BIGINT UNSIGNED,
 recipient_type ENUM('student','tutor','all_students','all_tutors','all_users') NOT NULL,
 channel ENUM('email','whatsapp') NOT NULL, subject VARCHAR(255), message TEXT NOT NULL,
 status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending', provider_message_id VARCHAR(255), sent_at DATETIME, error_message TEXT,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_communications_sender(sender_id), INDEX idx_communications_recipient(recipient_id), INDEX idx_communications_channel(channel), INDEX idx_communications_status(status), INDEX idx_communications_created(created_at),
 CONSTRAINT fk_communications_sender FOREIGN KEY(sender_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_communications_recipient FOREIGN KEY(recipient_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cms_pages (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL UNIQUE,
 content LONGTEXT, meta_title VARCHAR(255), meta_description TEXT,
 status ENUM('draft','published','inactive') NOT NULL DEFAULT 'draft', created_by BIGINT UNSIGNED NOT NULL, updated_by BIGINT UNSIGNED,
 published_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_cms_pages_status(status), INDEX idx_cms_pages_created_by(created_by), INDEX idx_cms_pages_updated_by(updated_by),
 CONSTRAINT fk_cms_pages_created_by FOREIGN KEY(created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
 CONSTRAINT fk_cms_pages_updated_by FOREIGN KEY(updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cms_contents (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, section_key VARCHAR(100) NOT NULL UNIQUE, title VARCHAR(255), content LONGTEXT,
 image_url VARCHAR(1000), data JSON, status ENUM('active','inactive') NOT NULL DEFAULT 'active', updated_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_cms_contents_status(status), INDEX idx_cms_contents_updated_by(updated_by),
 CONSTRAINT fk_cms_contents_updated_by FOREIGN KEY(updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, setting_key VARCHAR(150) NOT NULL UNIQUE, setting_value TEXT,
 setting_group VARCHAR(100) NOT NULL DEFAULT 'general', is_public BOOLEAN NOT NULL DEFAULT FALSE, updated_by BIGINT UNSIGNED,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_settings_group(setting_group), INDEX idx_settings_public(is_public),
 CONSTRAINT fk_settings_updated_by FOREIGN KEY(updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE files (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, uploaded_by BIGINT UNSIGNED NOT NULL,
 original_name VARCHAR(255) NOT NULL, file_name VARCHAR(255) NOT NULL,
 storage_provider ENUM('local','cloudflare_r2','vimeo','gcs','cloudinary') NOT NULL DEFAULT 'local', storage_key VARCHAR(1000), file_url VARCHAR(1000) NOT NULL,
 mime_type VARCHAR(150), file_size BIGINT UNSIGNED, entity_type VARCHAR(100), entity_id BIGINT UNSIGNED,
 status ENUM('active','deleted') NOT NULL DEFAULT 'active',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX idx_files_uploaded_by(uploaded_by), INDEX idx_files_entity(entity_type,entity_id), INDEX idx_files_status(status),
 CONSTRAINT fk_files_uploaded_by FOREIGN KEY(uploaded_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_exports (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, generated_by BIGINT UNSIGNED NOT NULL,
 report_type ENUM('student','tutor','course','sales') NOT NULL, filters JSON, file_url VARCHAR(1000),
 status ENUM('processing','completed','failed') NOT NULL DEFAULT 'processing', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at DATETIME,
 INDEX idx_report_exports_generated_by(generated_by), INDEX idx_report_exports_type(report_type), INDEX idx_report_exports_status(status),
 CONSTRAINT fk_report_exports_generated_by FOREIGN KEY(generated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders are created after enrollments, so this FK is added here to complete the relationship.
ALTER TABLE enrollments
  ADD CONSTRAINT fk_enrollments_order
  FOREIGN KEY (order_id) REFERENCES orders(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

INSERT INTO roles(name,description,status) VALUES
('student','Student / learner account','active'),
('tutor','Tutor / instructor account','active'),
('admin','Administrator account','active');

SET FOREIGN_KEY_CHECKS = 1;
-- ============================================================
-- END
-- ============================================================
