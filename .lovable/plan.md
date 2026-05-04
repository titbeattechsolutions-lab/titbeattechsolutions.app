# Role-based access after school login

## 1. New role-selection step in `SchoolLock`
After verifying the school PIN, instead of immediately prompting for the admin PIN, show a "Continue as…" screen with two cards:
- **Admin** → existing admin-PIN flow (or first-time set-admin flow).
- **Staff** → new flow: pick name from `staffList` (loaded from tenant data) and enter their personal PIN (already stored on each `StaffMember`).

Save the chosen role into the tenant session so the app knows who is signed in.

## 2. Session shape
Extend `TenantSession` (and `saveTenantSession`) with:
- `role: "admin" | "staff"`
- `staffId?: string`
- `staffName?: string`

Staff verification stays client-side against the encrypted tenant data already loaded after the school PIN — no DB changes needed (PINs are already part of the staff record).

## 3. Activity log scoping
`LogEntry` already exists in the store. Add `staffId` and `staffName` fields to new entries (back-compat: old entries show "—"). All `dispatch` calls that create logs read the current session and stamp the actor.

In the app shell:
- **Admin role** → sees the full Activity tab grouped by staff with timestamps and filters.
- **Staff role** → sees only their own entries; admin-only tabs (Staff management, Settings, Reports export of others) are hidden.

## 4. UI differentiation
Pass `role` from `TenantApp` into `SchoolApp` via context. Filter the bottom nav:
- Admin: Home, Scores, Attendance, Reports, Staff, Activity, Settings.
- Staff: Home, Scores, Attendance, My Activity.

A small header chip shows "Admin · Principal" or "Staff · {name}" with a Sign-out button.

## 5. Files touched
- `src/lib/tenant-client.ts` — extend session type.
- `src/pages/SchoolLock.tsx` — add role-picker + staff PIN step.
- `src/pages/TenantApp.tsx` — pass role/staff into the app.
- `src/lib/school-store.ts` — add `staffId`/`staffName` to `LogEntry`, helper to record activity, expose role in `AppCtx`.
- `src/components/school/SchoolApp.tsx` — role-aware nav + new `ActivityTab`.
- New `src/components/school/ActivityTab.tsx` — list view with timestamp, filtered by role.
- Update existing tabs that emit logs to include the actor.

No database/RLS changes required — staff PINs already live inside the tenant's encrypted JSON blob.

## Out of scope
- Server-side per-staff access control (everything stays client-side per existing architecture memory).
- Resetting individual staff PINs from this screen (already handled in Staff tab).
