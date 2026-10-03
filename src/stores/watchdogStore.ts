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
}

interface WatchdogStoreState {
  activity: AuditRecord[];
  pending: PendingApproval[];
  runs: AgentRun[];
  connected: boolean;
  runnerConnected: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  startPolling: (intervalMs?: number) => () => void;
}

const ACTIVITY_LIMIT = 40;

export const useWatchdogStore = create<WatchdogStoreState>((set) => ({
  activity: [],
  pending: [],
  runs: [],
  connected: false,
  runnerConnected: false,
  lastError: null,

  refresh: async () => {
    try {
      const res = await fetch(`/watchdog/activity?limit=${ACTIVITY_LIMIT}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { activity: AuditRecord[]; pending: PendingApproval[] };
      set({ activity: data.activity, pending: data.pending, connected: true, lastError: null });
    } catch (error) {
      set({ connected: false, lastError: error instanceof Error ? error.message : String(error) });
    }
    // The runner is a separate host process and may be down independently of the watchdog.
    try {
      const res = await fetch('/runner/runs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { runs: AgentRun[] };
      set({ runs: data.runs, runnerConnected: true });
    } catch {
      set({ runnerConnected: false });
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
