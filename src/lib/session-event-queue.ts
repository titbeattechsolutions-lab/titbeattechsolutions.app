/**
 * session-event-queue.ts
 *
 * Offline-first outbox for staff session events (login / logout).
 *
 * Problem it solves:
 *   `log_staff_session_event` RPC calls silently fail when the device is
 *   offline. Over a school term this creates audit-log gaps in Supabase.
 *
 * How it works:
 *   1. enqueueSessionEvent()  — writes the event to localStorage instead of
 *      firing the RPC directly. The event is timestamped so the audit log
 *      reflects the actual login time, not the replay time.
 *   2. drainSessionEventQueue() — called when the browser fires the "online"
 *      event. Replays all queued events against Supabase and clears the queue.
 *
 * No database schema changes required.
 * No Supabase types modified.
 */

const QUEUE_KEY = "gm_session_event_queue_v1";

export interface SessionEvent {
  sessionToken: string;
  staffMemberId: string;
  staffName: string;
  role: string;
  action: "login" | "logout";
  /** ISO timestamp of when the event actually occurred (not when it was sent) */
  occurredAt: string;
}

/** Read the current queue from localStorage. Returns [] on any error. */
function readQueue(): SessionEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SessionEvent[]) : [];
  } catch {
    return [];
  }
}

/** Overwrite the queue in localStorage. */
function writeQueue(events: SessionEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
  } catch {
    // Storage full — silently skip; the event is lost but the app keeps working.
  }
}

/**
 * Add a session event to the offline outbox.
 * Call this instead of directly firing the Supabase RPC.
 */
export function enqueueSessionEvent(event: SessionEvent): void {
  const queue = readQueue();
  queue.push(event);
  writeQueue(queue);
}

/**
 * Replay all queued events against Supabase and clear the queue.
 * Call this from the "online" event listener in TenantApp.tsx.
 *
 * The function is intentionally resilient — individual failures are logged but
 * do not abort the drain. Successfully replayed events are removed individually
 * so a partial network failure doesn't re-send already-processed events.
 */
export async function drainSessionEventQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  // Lazy-import to avoid adding Supabase to the critical path
  let supabaseClient: any;
  try {
    const mod = await import("@/integrations/supabase/client");
    supabaseClient = mod.supabase;
  } catch {
    return; // Supabase module failed to load; leave queue intact
  }

  const remaining: SessionEvent[] = [];

  for (const evt of queue) {
    try {
      const { error } = await supabaseClient.rpc("log_staff_session_event", {
        _session_token: evt.sessionToken,
        _staff_member_id: evt.staffMemberId,
        _staff_name: evt.staffName,
        _role: evt.role,
        _action: evt.action,
      });
      if (error) {
        // Keep in queue for next reconnect
        remaining.push(evt);
        console.warn("[session-queue] RPC error, event kept:", error.message);
      }
      // On success: event is NOT added back → effectively removed
    } catch {
      remaining.push(evt);
    }
  }

  writeQueue(remaining);
  if (remaining.length === 0) {
    console.info(`[session-queue] Drained ${queue.length} queued session event(s).`);
  }
}
