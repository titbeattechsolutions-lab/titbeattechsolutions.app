# MySchoolGradeFlow

A multi-tenant school management platform built on **React + Vite + Supabase**.  
Each school is a fully isolated tenant. All data access is enforced by PostgreSQL Row Level Security — no app-level filtering required.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Local Dev Setup](#local-dev-setup)
4. [Provisioning a New School](#provisioning-a-new-school)
5. [Running Migrations](#running-migrations)
6. [Deploying Edge Functions](#deploying-edge-functions)
7. [Adding a New Role](#adding-a-new-role)
8. [Adding a New Feature Flag](#adding-a-new-feature-flag)
9. [Cost Controls](#cost-controls)
10. [Security Hardening Checklist](#security-hardening-checklist)
11. [Architecture Decisions](#architecture-decisions)

---

## Architecture Overview

```
Browser (React/Vite)
  │
  ├── supabase/client.ts          ← single Supabase client (anon key)
  ├── src/supabase/schoolService.ts ← ALL DB calls go through here
  ├── src/hooks/useSchoolQuery.ts ← React Query wrappers (caching)
  │
  └── Supabase (single project, multi-tenant via RLS)
        ├── auth.users            ← Supabase Auth
        ├── public.profiles       ← role + school_id per user
        ├── public.schools        ← one row per tenant school
        ├── public.students / teachers / classes / subjects
        ├── public.results        ← score_total computed by trigger
        ├── public.attendance
        ├── public.fees / payments
        ├── public.billing / pre_registrations / activity_logs
        └── Edge Functions
              ├── provision-school   ← creates school + billing + pre_reg
              ├── initiate-payment   ← creates Paystack charge + pending payment row
              └── payment-webhook    ← Paystack callback → updates payment status
```

**Key principle**: every table policy calls `auth.school_id()` which reads `profiles.school_id` for the JWT owner. A suspended school's users get zero rows immediately because `auth.school_is_active()` returns false and is embedded in all read policies.

---

## Project Structure

```
src/
  App.tsx                        Route tree (/, /auth, /school/*, /teacher/*, /superadmin/*, /admin)
  contexts/AuthContext.tsx        Auth session + role + schoolId
  hooks/
    useFeature.ts                 Read school.features JSONB → boolean
    useSchool.ts                  Full school profile from DB
    useSchoolQuery.ts             React Query wrappers for all school data
  integrations/supabase/
    client.ts                     createClient with VITE_SUPABASE_ANON_KEY
    types.ts                      Generated database types
  supabase/
    schoolService.ts              ONLY file that calls supabase directly for school data
  layouts/
    DashboardLayout.tsx           School admin sidebar + nav
    TeacherLayout.tsx             Teacher portal sidebar
    SuperadminLayout.tsx          Superadmin panel sidebar
  pages/
    admin/                        School admin pages (OverviewPage, StudentsPage, …)
    teacher/                      Teacher pages (MyClassesPage, AttendancePage, ResultsPage)
    superadmin/                   Superadmin pages (SchoolsListPage, SchoolDetailPage, …)
    SuperAdmin.tsx                Legacy tenant/PIN management panel
  components/
    FeatureGuard.tsx              Gates content behind school.features flags
    ProtectedRoute.tsx            Guards routes by role

supabase/
  config.toml                     project_id
  migrations/                     All schema migrations (run in filename order)
    004_profiles_and_rls_helpers  RLS helper functions (auth.school_id, auth.is_teacher, …)
    005_schools                   schools table + superadmin policies
    006_students                  students table + RLS
    007_academic                  teachers, classes, subjects tables
    008_results                   results table + score_total trigger
    009_attendance                attendance table
    010_fees                      fees + payments tables (client write block on payments)
    011_supporting_tables         pre_registrations + billing (write-blocked)
    012_student_count_trigger     Keeps schools.current_students accurate
    013_phase8_rls_and_activity   auth.school_is_active() + activity_logs + suspend enforcement
    014_indexes                   Composite indexes for 1000+ school scale
    015_storage_and_checklist     Storage buckets + deployment verification queries
  functions/
    provision-school/index.ts     Creates school record + billing row + pre_registration + welcome email
    initiate-payment/index.ts     Paystack charge creation + pending payment row
    payment-webhook/index.ts      Paystack webhook handler → updates payment status
```

---

## Local Dev Setup

**Prerequisites**: Node 18+, [Supabase CLI](https://supabase.com/docs/guides/cli), Docker Desktop.

```bash
# 1. Clone and install
git clone <repo-url>
cd myschoolgradeflow
npm install

# 2. Copy env template and fill in your Supabase project credentials
cp .env.example .env.local
# Edit .env.local: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
# (Dashboard → Project Settings → API)

# 3. Push migrations to your Supabase project
supabase db push

# 4. Deploy Edge Functions
supabase functions deploy provision-school
supabase functions deploy initiate-payment
supabase functions deploy payment-webhook

# 5. Set Edge Function secrets (never in .env)
supabase secrets set RESEND_API_KEY=re_...
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...

# 6. Start the frontend
npm run dev
# → http://localhost:5173
```

> **First-time superadmin**: After `supabase db push`, sign up via `/auth`, then manually set `role = 'super_admin'` in `public.profiles` for your user via the Supabase Dashboard Table Editor. All subsequent school provisioning is done through the `/admin` or `/superadmin` panels.

---

## Provisioning a New School

**Via the UI** (recommended):  
Log in as superadmin → `/superadmin/provision` → fill the form → click **Provision School**.

**Via CLI/API**:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/provision-school \
  -H "Authorization: Bearer YOUR_SUPERADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "uuid-from-tenants-table",
    "name": "Greenwood Secondary School",
    "code": "GSS",
    "email": "admin@greenwood.edu.ng",
    "adminEmail": "principal@greenwood.edu.ng",
    "adminName": "Mr. John Adeyemi",
    "plan": "starter"
  }'
```

The Edge Function atomically:
1. Inserts a row into `public.schools`
2. Inserts a row into `public.billing` (plan = starter, status = trial)
3. Inserts a row into `public.pre_registrations` for the admin email
4. Sends a welcome email via Resend

---

## Running Migrations

```bash
# Push all pending migrations to your linked Supabase project
supabase db push

# Check for schema drift (should return no diff on a clean deploy)
supabase db diff

# Pull remote schema changes back into local migration files
supabase db pull
```

Migrations run in **filename order** — always prefix new files with a timestamp or sequential number: `20260526000013_016_my_change.sql`.

---

## Deploying Edge Functions

```bash
# Deploy all three functions
supabase functions deploy provision-school
supabase functions deploy initiate-payment
supabase functions deploy payment-webhook

# Verify active status
supabase functions list
# All three should show status: Active

# View logs for a function
supabase functions logs provision-school --tail
```

---

## Adding a New Role

1. **Migration** — add to the `CHECK` constraint in `public.profiles`:
   ```sql
   ALTER TABLE public.profiles
     DROP CONSTRAINT IF EXISTS profiles_role_check;
   ALTER TABLE public.profiles
     ADD CONSTRAINT profiles_role_check
     CHECK (role IN ('superadmin','school_admin','principal','head_teacher','teacher','counselor','unassigned'));
   ```

2. **RLS helper** — if the new role needs read access, update `auth.is_teacher()`:
   ```sql
   CREATE OR REPLACE FUNCTION auth.is_teacher() RETURNS BOOLEAN ...
     SELECT role IN ('superadmin','school_admin','principal','head_teacher','teacher','counselor')
   ```

3. **Frontend** — add to `SCHOOL_ROLES` in `src/App.tsx` and to any `ProtectedRoute allowedRoles` arrays that should include the new role.

4. **Navigation** — conditionally show/hide nav items in `DashboardLayout.tsx` based on `useAuth().role`.

---

## Adding a New Feature Flag

1. **Default value** — update the `features` JSONB default in `public.schools`:
   ```sql
   ALTER TABLE public.schools
     ALTER COLUMN features SET DEFAULT
     '{"attendance":true,"results":true,"fees":false,"library":false,"events":true,"timetable":false}'::jsonb;
   ```

2. **Existing schools** — backfill the new key:
   ```sql
   UPDATE public.schools
   SET features = features || '{"timetable": false}'::jsonb
   WHERE features->>'timetable' IS NULL;
   ```

3. **Hook** — in any component:
   ```tsx
   const hasTimetable = useFeature('timetable'); // src/hooks/useFeature.ts
   ```

4. **Guard** — wrap the page:
   ```tsx
   <FeatureGuard feature="timetable">
     <TimetablePage />
   </FeatureGuard>
   ```

5. **Plan update** — update `PLAN_FEATURES` in `src/pages/superadmin/SchoolDetailPage.tsx` to include the flag for the appropriate plans.

---

## Cost Controls

| Control | Implementation |
|---|---|
| **Spend cap** | Dashboard → Billing → Spend cap — set a hard monthly limit |
| **Connection pooling** | Supabase PgBouncer enabled by default; Edge Functions use the pooler (transaction mode) connection string |
| **React Query caching** | `staleTime: 2 min` for student/class lists; `30 s` for attendance/results — prevents redundant DB reads on page revisit |
| **Pagination** | All list pages use `.range(page * 25, page * 25 + 24)` — never load full tables |
| **Composite indexes** | `014_indexes.sql` — ensures PG uses Index Scan not Seq Scan on all hot query patterns |
| **Selective Realtime** | Only `PaymentsPage` subscribes to Realtime; all others use one-time `.select()` |
| **Query Performance** | Dashboard → Database → Query Performance — monitor p99 latency weekly |

---

## Security Hardening Checklist

Run these checks before going live:

```sql
-- 1. All public tables have RLS enabled?
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: rowsecurity = true for ALL rows

-- 2. payments has no client write policies?
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'payments' AND schemaname = 'public';
-- Expected: only SELECT policies

-- 3. Triggers active?
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND trigger_name IN (
    'trg_compute_result_totals',
    'on_student_change',
    'on_auth_user_created_profile'
  );
-- Expected: 3 rows

-- 4. Auth helpers deployed?
SELECT proname FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'auth')
  AND proname IN ('school_id','user_role','is_teacher','is_school_admin','school_is_active');
-- Expected: 5 rows
```

```bash
# 5. Unauthenticated call returns 401?
curl -I https://YOUR_PROJECT.supabase.co/rest/v1/students
# Expected: HTTP/2 401

# 6. Auth settings (Dashboard → Authentication → Settings)
#    ✅ Email confirmations enabled
#    ✅ Site URL = production domain
#    ✅ JWT expiry = 3600
#    ✅ Production domain in allowed redirect URLs
```

---

## Architecture Decisions

### Single-project multi-tenancy via RLS
Every table has `school_id UUID NOT NULL`. The `auth.school_id()` helper reads `profiles.school_id` for the requesting JWT once per query (Postgres caches `STABLE` functions within a query). This means:
- Zero cross-tenant data leakage is possible — the DB enforces it, not the app
- No need for separate Supabase projects per school (simpler, cheaper)
- Suspending a school is one `UPDATE schools SET status='suspended'` — `auth.school_is_active()` immediately returns false for all that school's users

### Trigger-computed totals, not app math
`score_total`, `grade`, and `remark` on `results` are computed by `trg_compute_result_totals` (BEFORE INSERT/UPDATE). The trigger also blocks any client that tries to set `score_total` directly. This ensures:
- Report cards are always consistent with the raw scores
- No client-side calculation drift
- Verified by: `INSERT INTO results (..., score_ca1=15, score_ca2=15, score_exam=50) RETURNING score_total` → `80`

### Edge Functions for privileged writes
`payments`, `billing`, and `pre_registrations` have **no** client INSERT/UPDATE/DELETE policies. All writes go through Edge Functions running with the service role key. This prevents:
- Students fabricating payment records
- Schools modifying their own billing plan
- Invite token forgery

### `schoolService.ts` as the single DB boundary
All Supabase calls from React components go through `src/supabase/schoolService.ts`. Direct `supabase.from(...)` calls in components are only present in legacy files (`SuperAdmin.tsx`, `superadmin/` pages) where the superadmin context justifies it. This makes it trivial to:
- Audit all DB access in one file
- Add logging/tracing to every query
- Mock the service layer in tests

### React Query over manual `useEffect` fetching
`src/hooks/useSchoolQuery.ts` wraps every `schoolService` function in `useQuery`/`useMutation`. Benefits:
- Automatic deduplication: same query from two components → one network call
- Background refetch on window focus
- `placeholderData` keeps the previous page visible while fetching the next (pagination)
- `onSuccess` cache invalidation replaces manual `load()` calls after mutations
