/**
 * Watchdog Store
 * Polls the watchdog's read-only activity feed: what the agent has done (the audit log)
 * and what is waiting for a human (pending approvals). Read-only by design; approving
 * from the scene needs its own auth path so an agent can never reach it.
 */

import { create } from 'zustand';

export type WatchdogDecision = 'allow' | 'deny' | 'ask';

export interface AuditRecord {
  ts: number;
  agent: string;
  method: string;
  host: string;
  path: string;
  decision: WatchdogDecision;
  reason: string;
  rule: number | null;
}

export interface PendingApproval {
  id: string;
  agent: string;
  method: string;
  host: string;
  path: string;
  summary: string;
  age_s: number;
}

export interface AgentRun {
  id: string;
  goal: string;
  status: 'running' | 'done' | 'failed' | 'error';
  started: number;
  ended: number | null;
  exit_code: number | null;
  summary: string;
  routine: string | null;
}

export interface RoutineInfo {
  name: string;
  schedule: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  running: boolean;
}

interface WatchdogStoreState {
  activity: AuditRecord[];
  pending: PendingApproval[];
  runs: AgentRun[];
  routines: RoutineInfo[];
  connected: boolean;
  runnerConnected: boolean;
  lastError: string | null;
  /** The watchdog operator key, fetched once from the dev server (loopback only). Null = can't approve from here. */
  operatorKey: string | null;
  refresh: () => Promise<void>;
  decide: (id: string, decision: 'allow' | 'deny') => Promise<string | null>;
  startPolling: (intervalMs?: number) => () => void;
}

const ACTIVITY_LIMIT = 40;
const DOWN_RETRY_MS = 15_000; // a service that isn't running is polled gently, not every tick
let watchdogDownSince = 0;
let runnerDownSince = 0;

export const useWatchdogStore = create<WatchdogStoreState>((set) => ({
  activity: [],
  pending: [],
  runs: [],
  routines: [],
  connected: false,
  runnerConnected: false,
  lastError: null,
  operatorKey: null,

  decide: async (id, decision) => {
    let key = useWatchdogStore.getState().operatorKey;
    if (!key) {
      try {
        const res = await fetch('/operator-key', { cache: 'no-store' });
        if (!res.ok) return `no operator key (${res.status})`;
        key = ((await res.json()) as { token: string }).token;
        set({ operatorKey: key });
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
    try {
      const res = await fetch(`/watchdog/operator/decide/${encodeURIComponent(id)}?decision=${decision}`, {
        method: 'POST',
        headers: { 'X-Operator-Key': key },
      });
      if (res.status === 403) set({ operatorKey: null }); // key rotated: refetch next time
      if (!res.ok) return await res.text();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    await useWatchdogStore.getState().refresh();
    return null;
  },

  refresh: async () => {
    const now = Date.now();
    if (now - watchdogDownSince > DOWN_RETRY_MS) {
      try {
        const res = await fetch(`/watchdog/activity?limit=${ACTIVITY_LIMIT}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { activity: AuditRecord[]; pending: PendingApproval[] };
        set({ activity: data.activity, pending: data.pending, connected: true, lastError: null });
        watchdogDownSince = 0;
      } catch (error) {
        watchdogDownSince = now;
        set({ connected: false, lastError: error instanceof Error ? error.message : String(error) });
      }
    }
    // The runner is a separate host process and may be down independently of the watchdog.
    if (now - runnerDownSince > DOWN_RETRY_MS) {
      try {
        const res = await fetch('/runner/runs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { runs: AgentRun[] };
        const rr = await fetch('/runner/routines');
        const routines = rr.ok ? ((await rr.json()) as { routines: RoutineInfo[] }).routines : [];
        set({ runs: data.runs, routines, runnerConnected: true });
        runnerDownSince = 0;
      } catch {
        runnerDownSince = now;
        set({ runnerConnected: false });
      }
    }
  },

  startPolling: (intervalMs = 2000) => {
    const { refresh } = useWatchdogStore.getState();
    void refresh();
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => window.clearInterval(timer);
  },
}));

export const useWatchdogActivity = () => useWatchdogStore((s) => s.activity);
export const useWatchdogPending = () => useWatchdogStore((s) => s.pending);
export const useWatchdogConnected = () => useWatchdogStore((s) => s.connected);
export const useAgentRuns = () => useWatchdogStore((s) => s.runs);
export const useRoutines = () => useWatchdogStore((s) => s.routines);
