import swaggerUi from 'swagger-ui-express';
import schemas from './swagger/schemas.js';
import systemPaths from './swagger/systemPaths.js';
import authPaths from './swagger/authPaths.js';
import publicPaths from './swagger/publicPaths.js';
import studentPaths from './swagger/studentPaths.js';
import tutorPaths from './swagger/tutorPaths.js';
import createManagementPaths from './swagger/managementPaths.js';
import adminPaths from './swagger/adminPaths.js';
import communityPaths from './swagger/communityPaths.js';
import notificationPaths from './swagger/notificationPaths.js';

export const swaggerTags = [
  { name: '1. System & Health', description: 'System info, health checks, video streaming, and webhooks' },
  { name: '2. Authentication', description: 'Registration, login, logout, password recovery, and email verification' },
  { name: '3. Account Management', description: 'User profile, avatar uploads, security settings, and password updates' },
  { name: '4. Public Website', description: 'Homepage composite, course catalog, reviews, tutors, CMS pages, and certificate validation' },
  { name: '5. Student - Dashboard & Learning', description: 'Learning overview, course player, curriculum hierarchy, and the 90% completion rule (play / join adds progress)' },
  { name: '6. Student - Quizzes & Assessments', description: 'Quizzes discovery, attempts, timed exams, and automated grading' },
  { name: '7. Student - Final Projects', description: 'Final project guidelines, submission at 90% progress (Pending Approval), resubmission after rejection' },
  { name: '8. Student - Live Classes', description: 'Live Zoom sessions for enrolled courses, scheduled join windows, and attendance' },
  { name: '9. Student - Certificates', description: 'Course completion certificates, eligibility checks, and vector PDF download' },
  { name: '10. Student - Wishlist, Cart & Orders', description: 'Wishlist, cart, coupon discounting, Razorpay payment verification, and order history' },
  { name: '11. Student - Reviews', description: 'Course reviews and 5-star ratings submission' },
  { name: '12. Tutor - Dashboard & Students', description: 'Instructor KPIs, course statistics, student tracking, and lecture progress audits' },
  { name: '13. Tutor - Reviews & Earnings', description: 'Course ratings, 70% revenue share breakdown, and payout transactions' },
  { name: 'Course Management - Curriculum & Media', description: 'Course builder, sections, lectures, resource documents, and video uploads' },
  { name: 'Course Management - Quizzes', description: 'Quiz builder, question bank (single, multiple, true/false), marks, and student attempt logs' },
  { name: 'Course Management - Projects', description: 'Capstone definitions, submission evaluations, tutor feedback, and completion approval' },
  { name: 'Course Management - Certificates', description: 'Completion review dossier, approval signing, and PDF preview' },
  { name: 'Course Management - Live Classes (Zoom)', description: 'Scheduling sessions, automatic Zoom meeting creation, host start links, and attendee rosters' },
  { name: '19. Admin - Dashboard & Analytics', description: 'Executive platform analytics, revenue aggregates, and system metrics' },
  { name: '20. Admin - Users, Students & Tutors', description: 'User administration, invitations, tutor approval workflow, and student enrollments' },
  { name: '21. Admin - Courses & Categories', description: 'Course review & publishing, tutor assignment, and category taxonomy' },
  { name: '22. Admin - Enrollments & Progress', description: 'Enrollment lifecycle management, progress audits, and recalculations' },
  { name: '23. Admin - Orders, Payments & Coupons', description: 'Order ledger, offline payment verification, refunds, and coupon engine' },
  { name: '24. Admin - Tutor Payouts', description: 'Tutor revenue share settlements and payout disbursements' },
  { name: '25. Admin - Community & Review Moderation', description: 'Post, comment, and review moderation workflows' },
  { name: '26. Admin - Communications & Notifications', description: 'Multi-channel email & WhatsApp broadcasts, template variables, and in-app alerts' },
  { name: '27. Admin - Reports & Analytics', description: 'Analytical CSV/JSON data reports and export queues' },
  { name: '28. Admin - Website CMS', description: 'Static pages and dynamic homepage CMS blocks' },
  { name: '29. Admin - System Settings', description: 'Platform configurations: General, Payment, Email (SMTP), WhatsApp Cloud API, and Zoom OAuth' },
  { name: '30. Community - Feed, Discussions & Social', description: 'Lifetime developer community feed, course discussion boards, comments, and likes' },
  { name: '31. Notifications', description: 'In-app notification center (unread counters, mark read, clear)' },
  { name: '32. Media & Webhooks', description: 'Byte-range video streaming and external payment webhooks' }
];

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ATV Academy LMS API',
    version: '2.0.0',
    description: `
# ATV Academy – Enterprise Learning Management System API

The **ATV Academy LMS API** provides a backend infrastructure for a multi-role learning platform serving **Students**, **Instructors (Tutors)**, and **Administrators**.

---

### Core Business Rules & System Architecture

1. **Authentication & RBAC**:
   - Authentication via Bearer JWT (\`Authorization: Bearer <token>\`) or httpOnly cookie (\`token\`).
   - Role-Based Access Control (**Student**, **Tutor**, **Admin**).
   - Tutors self-register as \`pending\` and must be approved by an administrator before gaining panel access.

2. **Course Progression & Completion Engine**:
   - **90% Completion Rule - Phase 1 (0% -> 90%)**: each recorded-video play (\`POST /student/lectures/:id/play\`) or live-class join adds a fixed increment (default 10%), capped at 90%. Repeat plays of the same item within 10 minutes count once (configurable).
   - **Phase 2 (90% -> Pending Approval)**: at 90% the final project unlocks; after submission the course shows "Pending Approval" and the submission appears on the tutor and admin dashboards.
   - **Phase 3 (Pending -> 100%)**: approval sets progress to 100% and issues the certificate (view / download + public verification). Rejection notifies the student, keeps 90% and allows resubmission.
   - Courses without a final project complete when progress reaches 90%.

3. **Secure Media Delivery**:
   - Recorded videos are stored on **Vimeo** (hidden on vimeo.com, embed-only, optionally restricted to your domains). Lecture endpoints return a \`playback\` object with the Vimeo player \`embed_url\` only to enrolled students, course tutors and admins.
   - Documents, project files, images and report exports are stored on **Cloudflare R2**; private files are streamed through access-checked API endpoints, images use the public R2 URL.
   - Without Vimeo / R2 configured (development), files stay on the server and videos stream via \`GET /media/videos/:id/stream?token=\` (HTTP 206, 4-hour signed token).

4. **Zoom Live Classes**:
   - Integrated with Zoom Server-to-Server OAuth API for automated meeting creation, password generation, and host links.
   - Join links are securely restricted: students can join only within the join window (15 minutes before start until scheduled end).

5. **E-Commerce & Orders**:
   - Server-side Razorpay signature verification and HMAC webhook listeners guarantee tamper-proof fulfillment.
   - Supports fixed and percentage discount coupons, cart management, and retry payments.

6. **Lifetime Community**:
   - Purchasing any course permanently grants lifetime access to the community feed, discussion boards, comments, and likes.

7. **Real-time WebSockets**:
   - Integrated \`socket.io\` server broadcasts instant alerts and updates to connected clients using JWT authentication.
    `,
    contact: {
      name: 'ATV Academy Engineering Team',
      email: 'support@atvacademy.com',
      url: 'https://atvacademy.com'
    }
  },
  servers: [
    { url: '/api/v1', description: 'API Version 1 (Relative)' },
    { url: 'http://localhost:5000/api/v1', description: 'Local Development Server' }
  ],
  tags: swaggerTags,
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide the JWT token in the format: `Bearer <token>`'
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'token',
        description: 'JWT token stored in httpOnly session cookie'
      }
    },
    schemas
  },
  paths: {
    ...systemPaths,
    ...authPaths,
    ...publicPaths,
    ...studentPaths,
    ...tutorPaths,
    ...createManagementPaths('/tutor', 'Tutor'),
    ...createManagementPaths('/admin', 'Admin'),
    ...adminPaths,
    ...communityPaths,
    ...notificationPaths
  }
};

export const swaggerUiOptions = {
  customCss: `
    .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .swagger-ui .topbar { background-color: #0f172a; border-bottom: 2px solid #3b82f6; padding: 12px 0; }
    .swagger-ui .topbar-wrapper img { content: url('https://img.icons8.com/color/96/graduation-cap.png'); width: 38px; height: 38px; }
    .swagger-ui .topbar-wrapper .link { font-size: 1.25rem; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
    .swagger-ui .topbar-wrapper .link:after { content: ' ATV Academy LMS API Documentation'; margin-left: 8px; font-weight: 600; color: #60a5fa; }
    .swagger-ui .info { margin: 30px 0 25px 0; }
    .swagger-ui .info .title { font-size: 2.2rem; color: #0f172a; font-weight: 800; }
    .swagger-ui .info .description { font-size: 0.95rem; line-height: 1.6; color: #334155; }
    .swagger-ui .btn.authorize { background-color: #2563eb; color: #fff; border-color: #2563eb; border-radius: 6px; font-weight: 600; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
    .swagger-ui .opblock.opblock-get { border-color: #3b82f6; background: rgba(59, 130, 246, 0.05); }
    .swagger-ui .opblock.opblock-post { border-color: #10b981; background: rgba(16, 185, 129, 0.05); }
    .swagger-ui .opblock.opblock-put { border-color: #f59e0b; background: rgba(245, 158, 11, 0.05); }
    .swagger-ui .opblock.opblock-delete { border-color: #ef4444; background: rgba(239, 68, 68, 0.05); }
    .swagger-ui .opblock.opblock-patch { border-color: #8b5cf6; background: rgba(139, 92, 246, 0.05); }
    .swagger-ui .opblock .opblock-summary-method { border-radius: 4px; font-weight: 700; font-size: 0.8rem; }
    .swagger-ui section.models { border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 30px; }
  `,
  customSiteTitle: 'ATV Academy LMS API Documentation',
  customfavIcon: 'https://img.icons8.com/color/48/graduation-cap.png',
  swaggerOptions: {
    docExpansion: 'none',
    filter: true,
    persistAuthorization: true,
    displayRequestDuration: true,
    tryItOutEnabled: true
  }
};

export { swaggerUi };
export default { swaggerSpec, swaggerUi, swaggerUiOptions };
