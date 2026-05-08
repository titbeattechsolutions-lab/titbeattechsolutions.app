## Goals

1. **Uniform cross-device sync** — when the same School PIN is opened on Device A and Device B, both devices see the same data and changes propagate near real-time (no more divergent UI).
2. **Timetable planner** — admin builds a weekly class timetable; staff see their assigned periods.
3. **Smart notifications (admin ↔ staff)** — both sides can send/receive notifications with badges.

All work stays inside the existing client-side architecture (`School_Management_App.tsx` monolith + `TenantApp.tsx` shell + tenant RPCs).

---

## 1. Fix cross-device sync

### Diagnosis
`TenantApp.tsx` only **fetches once on mount** and only **pushes** localStorage writes upward. There is no pull loop, so Device B never learns about Device A's changes until a manual reload. Two devices end up with diverging local state under the same school PIN.

### Fix
- Add a **pull loop** in `TenantApp.tsx`:
  - Every 8s (and on `window` focus / `online` event), call `fetchTenantData(session)`.
  - Compare a stable hash of incoming JSON vs `lastSaved.current`.
  - If different and **not in the middle of a pending push**, write to `localStorage` and dispatch a `storage` event so the app reducer rehydrates.
- Add a **rehydrate path** in `School_Management_App.tsx`:
  - Listen for `storage` events on key `schoolapp_v1`.
  - On change, reload state via the existing `loadFromStorage()` and dispatch `{ type: "HYDRATE", payload }` (new reducer case that replaces top-level state, preserving ephemeral UI).
- Add a **conflict guard**: tag each push with a monotonically-increasing `_rev` integer; ignore incoming pulls whose `_rev` ≤ local `_rev`. Prevents a slow pull from clobbering a fresh local edit.
- Show a tiny "Synced • just now" / "Syncing…" indicator in the top trial banner area.

This keeps the design fully client-driven (no schema changes) and gives near-real-time convergence across devices sharing one School PIN.

---

## 2. Timetable planner

New tab `Timetable` (admin-editable, staff read-only-for-others / editable-for-self if assigned).

Data shape stored in the same tenant JSON blob:
```ts
timetable: {
  periods: [{ id, label, start, end }],   // e.g. P1 08:00–08:40
  days: ["Mon","Tue","Wed","Thu","Fri"],
  cells: {
    [`${className}|${day}|${periodId}`]: { subject, teacherName }
  }
}
```

UI:
- Class selector + grid (Days × Periods).
- Tap a cell → bottom sheet to pick subject + teacher (autocomplete from existing staff list).
- Admin: full edit. Staff: read-only, but their own periods highlighted; "My Schedule" filter shows only cells where `teacherName === currentActor`.
- Print/export the active class's timetable to PDF using the existing `report-export.ts` helper.

Stored in the same `schoolapp_v1` blob → automatically benefits from the new sync.

---

## 3. Smart notifications (admin ↔ staff)

New tab `Inbox` + a bell icon with unread badge in the top bar.

Data:
```ts
notifications: [{
  id, createdAt, fromActor, fromRole: 'admin'|'staff',
  toScope: 'admin' | 'staff:<name>' | 'all-staff',
  title, body, priority: 'normal'|'high',
  readBy: string[]   // actor names who've opened it
}]
```

Behaviour:
- Admin can compose to: a specific staff, all staff, or broadcast.
- Staff can compose to: admin only.
- Inbox lists messages targeting the current viewer; unread = current actor not in `readBy`.
- Badge count in bottom-nav.
- "Smart" hooks: auto-generate notifications for key events that already flow through the audit log (e.g. attendance saved → notify admin; new term switched → notify all staff; CA draft pending > 7 days → nudge author). Lightweight rules in the reducer, no AI.
- High-priority notifications also raise an in-app toast via existing `useToastHook`.

Cross-device delivery is handled automatically by the new sync pull loop — when admin posts, every staff device sees it within ≤8s.

---

## Files touched

```text
src/pages/TenantApp.tsx                       (pull loop + rev guard + sync indicator)
src/components/school/School_Management_App.tsx
   ├─ HYDRATE reducer case + storage-event listener
   ├─ Timetable tab + bottom-sheet editor
   ├─ Inbox tab + composer + bell badge
   └─ smart-notification hooks in existing reducers
```

No DB migrations, no new RPCs — the existing `get_tenant_data_v2` / `save_tenant_data_v2` already carry whatever JSON we put in.

---

## Out of scope (call out if the user wants them later)

- True websocket realtime (would need a Supabase Realtime channel keyed by `tenant_id`; the 8s pull is good enough for school workflows and avoids extra infra).
- Push notifications when the app is closed (would need a service worker + push subscription).
- Per-staff timetable conflict detection across classes.
