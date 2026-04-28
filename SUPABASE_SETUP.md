# KTraion – Supabase setup

## 1. Project and keys

Create a project at [supabase.com](https://supabase.com). In **Project Settings → API**, copy the **Project URL** and **anon public** key into `js/supabase-config.js`.

## 2. Database schema

In **SQL Editor**, run the full contents of **`supabase-schema.sql`**. It creates:

- `profiles` (with `role` `user` | `admin`)
- Triggers so **`portal: 'admin_signup'`** in auth metadata (set only by the **Admin sign up** page) becomes **`profiles.role = 'admin'`**
- `handle_new_user` on `auth.users` so profiles are created even when email confirmation returns no session
- `enrollments`, `course_weeks`, `week_content`, `todo_templates`, `user_todo_completions`, `meq_questions`, `meq_question_submissions` and RLS policies

## 3. Auth

Under **Authentication → Providers → Email**, choose whether to require **Confirm email**. The schema supports both: unconfirmed users still get a profile row from `handle_new_user`.

## 4. Admin vs student sign-up

- **Student sign up** (`/signup/`) does not set `portal`; accounts stay `user`.
- **Admin sign up** (`/admin-signup/`, linked subtly in the footer) first asks for the **page password** (`Gus` in the shipped HTML). After that, the form sets `user_metadata.portal = 'admin_signup'`; the database assigns **`admin`**.

The page password is stored in client-side JavaScript (obscurity only). Change it by editing `admin-signup/index.html` (`PAGE_PASSWORD`).

## 5. After signup

Admins should use **Admin sign in** (`/admin-signin/`) with the access code, then Supabase email/password, to reach `/admin/`.

Students use **Log in** (`/login/`) and `/dashboard/`. **My profile** (`/profile/`) is where they edit name, phone, and college ID, see enrolments, and view their exam date (read-only). **Log out** is in the site footer when signed in on the home page, and at the bottom of the dashboard and profile pages.

## 6. MEQ course content (footer link)

**MEQ course content** (`/meq-course/`) edits `week_content` for the MEQ weeks. The old path `/course-admin/` redirects here. It does **not** use the staff access-code page (`/admin-signin/`). If the user is not logged in, they are sent to the normal **Log in** page, then returned here.

Row-level security allows **any authenticated user** to insert/update/delete `week_content` (see `supabase-schema.sql`). Any student account could change links—tighten this in SQL if you need admin-only edits again.

If your project still has the old **admin-only** policy on `week_content`, run **`supabase-migration-week-content-authenticated-write.sql`**.

## 7. MEQ question bank

The schema adds **`meq_questions`** (stem, model answer, sort order, published flag) and **`meq_question_submissions`** (per-user responses). Admins manage questions at **`/meq-question-bank-admin/`** (after **Admin sign in**). Students practise at **`/meq-question-bank/`** (published questions only; they save their own answers).

If your database was created before these tables existed, run **`supabase-migration-meq-question-bank.sql`** in the SQL Editor.

## 8. Exam countdown (students)

Each student’s **`profiles.exam_date`** drives the “X days until your exam” line on the dashboard. Admins set it in **Admin → Students** (date + Save). If your database predates that UI, run **`supabase-migration-admin-update-profiles.sql`** so the “Admins can update other profiles” policy exists.

## 9. Super admin access controls

Run **`supabase-migration-super-admin-access.sql`** to enable super-admin controls and seed the initial super admins:

- `d7e8795c-8e05-4d75-9d67-e7a86b595f26`
- `f03164f5-448d-4964-93a1-c6ee799ead77`

This migration:

- Adds `profiles.admin_access_enabled` and `profiles.is_super_admin`
- Updates `public.is_admin()` so access requires either super admin, or role `admin` + `admin_access_enabled = true`
- Restricts `week_content` and admin question-bank management to `public.is_admin()`
