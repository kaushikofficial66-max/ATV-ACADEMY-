# ATV Academy - Web Client

Next.js 16 (App Router) frontend for the ATV Academy LMS: the public website (SEO), and the
student, tutor and admin panels. It talks to the Express API in `../server`.

## Stack

- Next.js 16 App Router (JavaScript), React 19 with the React Compiler
- Tailwind CSS v4 (brand colours in `src/app/globals.css`)
- TanStack Query (server state), axios (API client), react-hook-form + zod (forms)
- sonner (toasts), lucide-react (icons), socket.io-client (live notifications)
- tus-js-client + @vimeo/player (Vimeo uploads / playback), Razorpay Checkout (payments)

## Getting started

```bash
cp .env.example .env.local   # adjust if the API is not on localhost:5000
npm install
npm run dev                  # http://localhost:3000
```

The API must be running (`cd ../server && npm run dev`, port 5000). The server's `FRONTEND_URL`
should be `http://localhost:3000` so email links (verify email, reset password) open this app.

| Variable                  | Example                          |
| ------------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_URL`     | `http://localhost:5000/api/v1`   |
| `NEXT_PUBLIC_SOCKET_URL`  | `http://localhost:5000`          |
| `NEXT_PUBLIC_SITE_URL`    | `http://localhost:3000`          |
| `NEXT_PUBLIC_SITE_NAME`   | `ATV Academy`                    |

Scripts: `npm run dev`, `npm run build`, `npm start`, `npm run lint`.

## Structure

```
src/
  app/
    (public)/        home, courses, course detail, tutors, CMS pages, certificate verify (server-rendered, SEO)
    (auth)/          login, register, forgot/reset password, verify email
    student/         dashboard, my courses, learn/[courseId] (+ lecture player), quizzes, projects,
                     live classes, certificates, community, wishlist, cart/checkout, orders, reviews
    tutor/           dashboard, courses + course builder, submissions, students, live classes,
                     certificates, reviews, earnings
    admin/           dashboard, students, tutors, users, courses + builder, categories, enrollments,
                     submissions, certificates, live classes, orders, payments, coupons, payouts,
                     community, reviews, communications, reports, CMS, settings
    sitemap.js, robots.js, not-found.jsx
  components/
    ui/              Button, Input, Card, Badge, DataTable, Pagination, Modal ...
    data/            ResourceList - paginated / filterable table for any list endpoint
    feedback/        loaders, empty / error states, pending-approval screen
    layout/          PanelShell (sidebar + topbar), public header / footer
  features/          domain modules: auth, account, notifications, courses, course-builder, videos,
                     learning, quizzes, projects, certificates, live-classes, commerce, community, reviews
  hooks/             useDebounce, useApiMutation (toast + cache invalidation)
  lib/               api client (browser + server), endpoints map, auth token + RoleGuard, socket, utils
  config/            roles, status colours, sidebar navigation
```

Notes:

- Panel pages are client components guarded by `RoleGuard` (role from `/auth/me`); public pages
  are server components using `serverGet()` with ISR (`revalidate`).
- Tutor and admin share the course-management API (`manage(role)` in `lib/api/endpoints.js`), so
  the builder components take a `role` prop and are reused by both panels.
- **90% completion rule:** each counted video play calls `POST /student/videos/:id/play`
  (progress up to 90%). At 90% the final project unlocks (`ProjectSubmitCard`); submissions
  show as *Pending approval* on tutor/admin dashboards; approving one (`SubmissionsReview`)
  completes the course at 100% and issues the certificate.
- Videos upload straight from the browser to Vimeo with tus (`VimeoUploader`); files, images and
  PDFs go through the API to Cloudflare R2.
