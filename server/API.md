# ATV Academy LMS – Backend API

Base URL: `/api/v1` · Auth: `Authorization: Bearer <token>` (or the `token` httpOnly cookie set at login).
Interactive Swagger Documentation: [`/api-docs`](http://localhost:5000/api-docs) · OpenAPI 3.0 Spec: [`/api-docs.json`](http://localhost:5000/api-docs.json)

All responses use `{ success, message, data, meta? }`. Lists accept `?page=&limit=` and return `meta: { total, page, limit, totalPages }`.
Validation errors return `422` with `errors: [{ field, message }]`.

## Setup

```bash
cp .env.example .env        # fill in DB + JWT_SECRET
npm install
npm run db:setup -- --fresh # NEW database only: creates all tables (drops existing ones!)
npm run db:migrate          # existing database: applies database/migrations (safe, idempotent)
npm run seed                # roles, first admin, default settings, categories, pages, homepage blocks
npm run dev                 # nodemon; `npm start` for production
DB_NAME=lms_db_test npm test   # end-to-end tests (wipes the *_test database)
```

Integrations (SMTP, Razorpay, Zoom, WhatsApp) can be configured in `.env` or in **Admin › Settings** (DB values win). Secrets are never returned unmasked.

Real-time notifications: connect `socket.io` to the API host with `{ auth: { token } }`, listen for `notification`.

### Business rules implemented

| Flow | Rule |
|---|---|
| Purchase | Cart → coupon → checkout → Razorpay → signature-verified `/payments/verify` (and webhook) → enrollment. Free/100%-coupon orders enroll immediately. |
| Recorded videos | Only `uploads/images` is public. Videos stream from `/media/videos/:id/stream?token=` – a 4-hour token issued only to enrolled students, the course's tutors, or admins. Range requests supported. |
| 90% completion rule – phase 1 (0→90%) | Each recorded-video play (`POST /student/lectures/:id/play` or `/student/videos/:id/play`) or live-class join adds `progress_increment_percent` (default 10%), capped at `progress_auto_cap_percent` (90%) – never higher. Repeat plays/joins of the same item within `progress_activity_cooldown_minutes` (default 10; 0 = every click) count once. Every counted click is stored in `progress_activities`. Watch time (`/progress`) only saves the resume position and lecture checkmarks. |
| Phase 2 (90% → Pending Approval) | At 90% the final project unlocks (`progress.status = project_unlocked`). After submission the course shows **Pending Approval** (still 90%) and the submission appears on the tutor and admin dashboards (`pending_project_approvals`). |
| Phase 3 (Pending → 100%) | Tutor/admin approval sets 100%, completes the enrollment and **issues the certificate immediately** (download + public verification). Rejection (feedback required) notifies the student, keeps 90% (`resubmission_required`) and allows a new submission. Courses without a final project complete at 90%. |
| Live classes | Students see classes of courses they are enrolled in; join URL only inside the join window (15 min before start → end). Zoom meetings auto-created when Zoom is configured; manual links otherwise. Reminders 30 min before; absentees recorded after the class. |
| Community | Lifetime access after any purchase. Course discussions limited to that course's students/tutors. Optional moderation (`community_moderation`). |
| Tutors | Self-registered tutors are `pending` until approved; tutors manage only courses they are assigned to. Earnings = paid order revenue × `tutor_revenue_share_percent` (default 70%), split between co-tutors. |

## 1. Public website — `/public` (no login)

| Feature | Endpoint |
|---|---|
| Homepage (CMS blocks, featured/latest/popular courses, categories, testimonials, stats) | `GET /public/home` |
| Content block | `GET /public/contents/:sectionKey` |
| Course listing (search, category, level, language, price=free/paid, min/max_price, tutor_id, sort=newest/popular/rating/price_asc/price_desc/title) | `GET /public/courses` |
| Course details (curriculum, tutors, rating breakdown, viewer state if logged in) | `GET /public/courses/:idOrSlug` |
| Course reviews | `GET /public/courses/:courseId/reviews` |
| Categories | `GET /public/categories` |
| Public tutor profiles | `GET /public/tutors`, `GET /public/tutors/:tutorId` |
| Static pages | `GET /public/pages`, `GET /public/pages/:slug` |
| Site settings (name, logo, currency, Razorpay key id…) | `GET /public/settings` |
| Certificate verification | `GET /public/certificates/verify/:certificateNumber` |

## 2. Authentication & account

| Feature | Endpoint |
|---|---|
| Register (`role`: student \| tutor) | `POST /auth/register` |
| Login / Logout | `POST /auth/login`, `POST /auth/logout` |
| Current user | `GET /auth/me` |
| Email verification | `POST /auth/verify-email {token}`, `POST /auth/resend-verification` |
| Forgot / reset password | `POST /auth/forgot-password {email}`, `POST /auth/reset-password {token,new_password}` |
| Profile management (+ professional info: bio, website, linkedin_url) | `GET/PUT /account/profile` (multipart `profile_image` optional) |
| Profile photo | `PUT/DELETE /account/profile-photo` |
| Password change | `PUT /account/password` |
| Account settings | `GET /account/settings`, `PUT /account/email`, `POST /account/deactivate` |
| Notifications (all roles) | `GET /notifications?status=unread`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/:id/unread`, `PATCH /notifications/read-all`, `DELETE /notifications/:id`, `DELETE /notifications` |

## 3. Student panel — `/student`

| Feature | Endpoint |
|---|---|
| Dashboard (overview, course progress, recent courses, upcoming live classes, recent notifications) | `GET /student/dashboard` |
| My courses / continue learning | `GET /student/courses?status=`, `GET /student/continue-learning` |
| Course player (curriculum + per-lecture progress, quizzes, project, certificate, resume point) | `GET /student/courses/:courseId/learn` |
| Lecture (content, signed video `stream_url`, resources, prev/next) | `GET /student/lectures/:lectureId` |
| Play (adds course progress – call on the player's play event) | `POST /student/lectures/:lectureId/play`, `POST /student/videos/:videoId/play` |
| Watch position (every ~15s + on pause/end; resume + checkmarks only) | `POST /student/lectures/:lectureId/progress {watched_seconds, position_seconds}` |
| Complete non-video lecture | `POST /student/lectures/:lectureId/complete` |
| Course progress / resources | `GET /student/courses/:courseId/progress`, `GET /student/courses/:courseId/resources`, `GET /student/resources/:id/download` |
| Video detail | `GET /student/videos/:videoId` |
| Quizzes | `GET /student/courses/:courseId/quizzes`, `GET /student/quizzes/:quizId`, `POST /student/quizzes/:quizId/start`, `POST /student/quiz-attempts/:attemptId/submit {answers:[{question_id, answer_id \| answer_ids[]}]}`, `POST /student/quizzes/:quizId/submit` (untimed), `GET /student/quiz-attempts/:attemptId` (result), `GET /student/quizzes/:quizId/attempts`, `GET /student/quiz-results` |
| Final project | `GET /student/courses/:courseId/project`, `POST /student/projects/:projectId/submit` (multipart `project_file`, `submission_note`), `GET /student/project-submissions`, `GET /student/project-submissions/:id/download`, `DELETE /student/project-submissions/:id` |
| Live classes | `GET /student/live-classes?scope=upcoming\|past\|all`, `GET /student/live-classes/:classId`, `POST /student/live-classes/:classId/join` → `join_url` (open in new tab) |
| Certificates | `GET /student/certificates`, `GET /student/courses/:courseId/certificate`, `GET /student/certificates/:id/download` (PDF) |
| Wishlist | `GET /student/wishlist`, `POST /student/wishlist {course_id}`, `DELETE /student/wishlist/:courseId`, `POST /student/wishlist/:courseId/move-to-cart` |
| Cart | `GET /student/cart?coupon_code=`, `POST /student/cart {course_id}`, `DELETE /student/cart/:courseId`, `DELETE /student/cart`, `POST /student/cart/:courseId/move-to-wishlist`, `POST /student/cart/apply-coupon {code}` |
| Checkout & payment | `POST /student/checkout {coupon_code?, course_ids?}` → Razorpay options; `POST /student/payments/verify {razorpay_order_id, razorpay_payment_id, razorpay_signature}`; `POST /student/payments/failed` |
| Orders | `GET /student/orders`, `GET /student/orders/:orderId`, `POST /student/orders/:orderId/retry-payment`, `POST /student/orders/:orderId/cancel` |
| Reviews | `POST/PUT/GET/DELETE /student/courses/:courseId/review`, `GET /student/reviews` (history) |

## 4. Community — `/community` (after any purchase)

`GET /community/feed?scope=general|courses|mine&course_id=&search=` · `GET /community/courses` (discussion boards) · `POST /community/posts` (multipart `attachment` image optional) · `GET/PUT/DELETE /community/posts/:postId` · `GET/POST /community/posts/:postId/comments {content, parent_comment_id?}` · `PUT/DELETE /community/comments/:commentId` · `POST /community/posts/:postId/like` (toggle) · `GET /community/posts/:postId/likes` · `GET /community/notifications`

## 5. Tutor panel — `/tutor` (approved tutors)

| Feature | Endpoint |
|---|---|
| Dashboard (course/student/earnings summaries, upcoming classes) | `GET /tutor/dashboard` |
| Profile / photo / professional info | `/account/*` |
| Course listing | `GET /tutor/courses?status=&search=` |
| Students | `GET /tutor/students?course_id=&status=&search=`, `GET /tutor/students/:studentId`, `GET /tutor/enrollments/:enrollmentId/progress` |
| Reviews | `GET /tutor/reviews?course_id=&rating=` |
| Earnings / payouts | `GET /tutor/earnings?from=&to=`, `GET /tutor/payouts` |
| Course builder, videos, quizzes, projects, certificates, live classes | see **Shared management** below, prefixed with `/tutor` |

## 6. Admin panel — `/admin`

| Feature | Endpoint |
|---|---|
| Dashboard | `GET /admin/dashboard` |
| Users | `POST /admin/users` (create student/tutor/admin + invite), `PUT /admin/users/:id`, `PATCH /admin/users/:id/status`, `POST /admin/users/:id/send-password-reset` |
| Students | `GET /admin/students`, `GET /admin/students/:id`, `PATCH /admin/students/:id/status`, `POST /admin/students/:id/enrollments {course_id}` |
| Tutors | `GET /admin/tutors?status=pending`, `GET /admin/tutors/:id`, `PATCH /admin/tutors/:id/approval {action: approve\|reject}`, `PATCH /admin/tutors/:id/status`, `GET /admin/tutors/:id/earnings` |
| Courses | `GET /admin/courses`, `PATCH /admin/courses/:id/approval {action: approve\|publish\|reject, approval_note}`, `PUT /admin/courses/:id/tutors {tutors:[{tutor_id,is_primary}]}` + shared management (any course) |
| Categories | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id?reassign_to=` |
| Enrollments & student progress | `GET /admin/enrollments?status=&course_id=&min_progress=`, `GET/PATCH /admin/enrollments/:id`, `POST /admin/enrollments/:id/recalculate` |
| Orders & payments | `GET /admin/orders`, `GET /admin/orders/:id`, `PATCH /admin/orders/:id/status {status: paid\|cancelled\|failed\|pending}`, `POST /admin/orders/:id/refund`, `GET /admin/payments`, `GET /admin/payments/:id` |
| Coupons | `GET/POST /admin/coupons`, `GET/PUT/DELETE /admin/coupons/:id`, `PATCH /admin/coupons/:id/status` |
| Tutor payouts | `GET/POST /admin/payouts`, `PATCH /admin/payouts/:id` |
| Progress & certificates | `GET /admin/project-submissions`, `GET /admin/certificates`, `POST /admin/certificates/:id/approve`, `POST /admin/certificates/:id/revoke`, `POST /admin/certificates/generate {enrollment_id, issue?}` |
| Community moderation | `GET /admin/community/posts`, `GET /admin/community/posts/:id`, `PATCH /admin/community/posts/:id/status`, `DELETE /admin/community/posts/:id`, `GET /admin/community/comments`, `PATCH /admin/community/comments/:id/status` |
| Review moderation | `GET /admin/reviews?status=pending`, `PATCH /admin/reviews/:id/moderate`, `PATCH /admin/reviews/bulk-moderate {ids, status}`, `DELETE /admin/reviews/:id` |
| Communication | `POST /admin/communications {channel: email\|whatsapp, recipient_type: student\|tutor\|all_students\|all_tutors\|all_users, recipient_id?, subject?, message}` (supports `{{first_name}}`), `GET /admin/communications` (history), `GET /admin/communications/:id`, `POST /admin/communications/:id/resend` |
| Notifications | `POST /admin/notifications {audience: user\|all_students\|all_tutors\|all_users\|course_students, title, message}`, `GET /admin/notifications?group=true` |
| Reports | `GET /admin/reports/:type?format=json\|csv&from=&to=&status=&course_id=&category_id=&tutor_id=` (type: student, tutor, course, sales), `POST /admin/reports/:type/export`, `GET /admin/report-exports`, `GET /admin/report-exports/:id/download` |
| Website / CMS | `GET/POST /admin/cms/pages`, `GET/PUT/DELETE /admin/cms/pages/:id`, `GET /admin/cms/contents`, `GET/PUT/DELETE /admin/cms/contents/:sectionKey` (e.g. `hero`, `features`, `featured_courses {data:{course_ids}}`, `faq`, `footer`) |
| Settings | `GET /admin/settings?group=`, `PUT /admin/settings/:group` (general, payment, email, whatsapp, zoom), `POST /admin/settings/{email,whatsapp,zoom}/test` |

## 7. Shared management (`/tutor/...` and `/admin/...`)

Tutors are limited to courses they are assigned to; admins can manage any course.

| Area | Endpoints |
|---|---|
| Courses | `POST /courses` (multipart `thumbnail`; tutors create drafts), `GET/PUT/DELETE /courses/:courseId`, `POST /courses/:courseId/submit` (for approval), `PATCH /courses/:courseId/status`, `GET /courses/:courseId/stats` |
| Curriculum | `GET /courses/:courseId/curriculum`, `POST /courses/:courseId/sections`, `PUT /courses/:courseId/sections/reorder {section_ids}`, `PUT/DELETE /sections/:sectionId`, `POST /sections/:sectionId/lectures`, `PUT /sections/:sectionId/lectures/reorder {lecture_ids}`, `GET/PUT/DELETE /lectures/:lectureId` |
| Lecture resources | `GET/POST /courses/:courseId/resources` (multipart `resource_file` or `file_url`), `PUT/DELETE /resources/:id`, `GET /resources/:id/download` |
| Recorded videos | `GET /courses/:courseId/videos?section_id=&unassigned=true`, `POST /courses/:courseId/videos` (multipart `video_file` or `video_url`; `section_id`/`lecture_id`; `duration_seconds`; `create_lecture=true`), `GET/PUT/DELETE /videos/:videoId` (assign via `section_id`/`lecture_id`), `PUT /videos/:videoId/file` (replace) |
| Quizzes | `GET/POST /courses/:courseId/quizzes`, `GET/PUT/DELETE /quizzes/:quizId`, `POST /quizzes/:quizId/questions`, `PUT /quizzes/:quizId/questions/reorder`, `PUT/DELETE /questions/:questionId`, `GET /quizzes/:quizId/results`, `GET /quiz-attempts/:attemptId` |
| Projects | `GET/POST /courses/:courseId/projects`, `GET/PUT/DELETE /projects/:projectId`, `GET /project-submissions?status=&course_id=`, `GET /project-submissions/:id`, `GET /project-submissions/:id/download`, `PUT /project-submissions/:id/review {status: under_review\|approved\|rejected\|resubmission_required, tutor_feedback}` |
| Certificates | `GET /certificates?status=pending`, `GET /certificates/:id/review` (completion review), `POST /certificates/:id/approve`, `GET /certificates/:id/download` |
| Live classes | `GET/POST /live-classes`, `GET/PUT/DELETE /live-classes/:classId`, `PATCH /live-classes/:classId/status`, `GET /live-classes/:classId/start` (host link), `GET /live-classes/:classId/attendance` |

## Database notes

- `database/schema.sql` – the 45-table schema as provided.
- `database/migrations/001_tutor_payouts.sql` – adds `tutor_payouts` (needed for Tutor › Earnings › Payout History; the base schema had nowhere to record payouts).
- `database/migrations/002_recorded_videos_vimeo.sql` – adds `recorded_videos.vimeo_video_id` (indexed); removes the unused `cloudflare_video_id` column only if it holds no data.
- `database/migrations/003_storage_providers.sql` – `files.storage_provider` becomes `local | cloudflare_r2 | vimeo | gcs | cloudinary` (no AWS S3).

## Storage (Vimeo + Cloudflare R2)

Configure in `.env` or **Admin › Settings › Storage** (DB values win). AWS is not used.

| What | Where | DB columns | How the frontend gets it |
|---|---|---|---|
| Recorded videos | **Vimeo** (hidden on vimeo.com, embed-only) | `recorded_videos.vimeo_video_id`, `video_url` = player embed URL, `thumbnail_url`, `duration_seconds` | `playback` object on lecture/video endpoints: `embed_url` (iframe or `@vimeo/player`), `thumbnail_url`; optional `hls_url`/`mp4_url` with `VIMEO_USE_DIRECT_LINKS=true`. Only enrolled students, course tutors and admins receive it. |
| Documents, project files, report CSVs | **Cloudflare R2** (private bucket) | stored as `r2:<folder>/<file>` in `file_url` | Downloaded through the existing access-checked API endpoints (streamed; bucket never exposed). |
| Images (avatars, thumbnails, CMS, community) | **Cloudflare R2** public bucket / custom domain | full public URL (`CLOUDFLARE_R2_PUBLIC_URL` + key) | Use the URL directly. Without a public URL images stay on local disk. |

Every upload is also recorded in `files` (`storage_provider` = `vimeo` / `cloudflare_r2` / `local`).

`STORAGE_DRIVER`: `auto` (Vimeo / R2 when configured, else local disk – default), `cloud` (required; uploads return 503 if not configured), `local` (development).

**Video options (tutor/admin):**
1. `POST /courses/{courseId}/videos` multipart `video_file` – the API uploads to Vimeo (resumable tus); fine for small/medium files.
2. `POST /courses/{courseId}/videos/direct-upload` `{ upload_length, section_id | lecture_id, title }` – returns `upload.url`; the browser uploads straight to Vimeo with tus-js-client (any size).
3. `POST /courses/{courseId}/videos` with `vimeo_url` – link a video already on your Vimeo account (it is never deleted from Vimeo by the LMS).

Vimeo videos start as `processing` and are not playable until Vimeo finishes transcoding. A background job checks every 5 minutes (or call `POST /videos/{videoId}/sync`); duration and thumbnail are filled in automatically and the uploader is notified if processing fails. Deleting a lesson video removes it from Vimeo only if the LMS uploaded it.

**Vimeo privacy:** `VIMEO_PRIVACY_VIEW=disable` (default) hides videos on vimeo.com; set `VIMEO_EMBED_DOMAINS=yourdomain.com` so the player only works on your site. `VIMEO_FOLDER_ID` keeps course videos in one Vimeo folder.

**Setup:** fill `VIMEO_ACCESS_TOKEN` (scopes: public private create edit delete upload video_files) and the `CLOUDFLARE_R2_*` values → restart → `POST /admin/settings/storage/test` → `npm run db:migrate`.
