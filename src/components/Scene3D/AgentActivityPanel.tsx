/**
 * Agent Activity Panel
 * A board floating in the scene that shows what the agent is doing right now: requests
 * waiting for approval (amber, pulsing) and the most recent watchdog decisions.
 * Read-only: the approve/deny path stays on the phone until it has its own auth.
 */

import { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import {
  useWatchdogStore,
  useWatchdogActivity,
  useWatchdogPending,
  useWatchdogConnected,
  useAgentRuns,
  useRoutines,
  type AuditRecord,
  type AgentRun,
} from '../../stores/watchdogStore';

const ROWS_SHOWN = 10;

const DECISION_STYLE: Record<AuditRecord['decision'], string> = {
  allow: 'text-emerald-300',
  deny: 'text-rose-300',
  ask: 'text-amber-300',
};

function shortPath(path: string, max = 28): string {
  return path.length > max ? `${path.slice(0, max - 1)}…` : path;
}

const RUN_STYLE: Record<AgentRun['status'], string> = {
  running: 'border-sky-400/50 bg-sky-400/10 text-sky-100',
  done: 'border-emerald-400/30 bg-emerald-400/5 text-emerald-100',
  failed: 'border-rose-400/40 bg-rose-400/10 text-rose-100',
  error: 'border-rose-400/40 bg-rose-400/10 text-rose-100',
};

function elapsed(run: AgentRun): string {
  const secs = Math.round(((run.ended ?? Date.now() / 1000) - run.started));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m${secs % 60}s`;
}

function timeOf(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

interface AgentActivityPanelProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export default function AgentActivityPanel({
  position = [-2.1, 1.6, 1.1],
  rotation = [0, Math.PI / 6, 0],
}: AgentActivityPanelProps) {
  const activity = useWatchdogActivity();
  const pending = useWatchdogPending();
  const connected = useWatchdogConnected();
  const runs = useAgentRuns();
  const routines = useRoutines();
  const startPolling = useWatchdogStore((s) => s.startPolling);
  const decide = useWatchdogStore((s) => s.decide);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const onDecide = async (id: string, decision: 'allow' | 'deny') => {
    setDeciding(id);
    setDecideError(await decide(id, decision));
    setDeciding(null);
  };

  useEffect(() => startPolling(), [startPolling]);

  // Newest first, with held-then-decided requests reading as one event each.
  const recent = [...activity].reverse().slice(0, ROWS_SHOWN);
  const nextRoutine = routines
    .filter((r) => r.enabled && r.next_run)
    .sort((a, b) => (a.next_run! < b.next_run! ? -1 : 1))[0];
  // Every run still going, plus the latest finished one so the result stays visible for a while.
  const shownRuns = [...runs.filter((r) => r.status === 'running'), ...runs.filter((r) => r.status !== 'running').slice(0, 1)];

  return (
    <group position={position} rotation={rotation}>
      <Html transform distanceFactor={1.4} style={{ width: '560px' }}>
        <div className="select-none rounded-xl border border-slate-700/60 bg-slate-950/90 p-4 font-mono text-[13px] text-slate-200 shadow-2xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="font-semibold tracking-wide">Agent activity</span>
            </div>
            <span className={pending.length ? 'text-amber-300' : 'text-slate-500'}>
              {pending.length} waiting for you
            </span>
          </div>

          {!connected && (
            <p className="mb-3 text-slate-500">Watchdog not reachable. Is it running on :8790?</p>
          )}

          {shownRuns.map((r) => (
            <div key={r.id} className={`mb-2 rounded-lg border px-3 py-2 ${RUN_STYLE[r.status]}`}>
              <div className="flex justify-between">
                <span className="font-semibold">
                  {r.routine ? `Routine ${r.routine}` : 'Agent'} {r.status === 'running' ? 'working' : r.status}
                </span>
                <span className="opacity-70">{elapsed(r)}</span>
              </div>
              <div className="truncate opacity-90" title={r.goal}>
                {r.goal}
              </div>
              {r.summary && <div className="mt-0.5 truncate text-[11px] opacity-60">{r.summary}</div>}
            </div>
          ))}

          {pending.map((p) => (
            <div
              key={p.id}
              className="mb-2 animate-pulse rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2"
            >
              <div className="flex justify-between text-amber-200">
                <span>
                  {p.agent} wants to {p.method} {p.host}
                </span>
                <span>{p.age_s}s</span>
              </div>
              <div className="truncate text-amber-100/70">{shortPath(p.path, 60)}</div>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={deciding === p.id}
                  onClick={() => void onDecide(p.id, 'allow')}
                  className="rounded-md bg-emerald-500/90 px-3 py-1 font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={deciding === p.id}
                  onClick={() => void onDecide(p.id, 'deny')}
                  className="rounded-md bg-rose-500/80 px-3 py-1 font-semibold text-rose-50 hover:bg-rose-400 disabled:opacity-50"
                >
                  Deny
                </button>
                <span className="text-[11px] text-amber-200/60">or answer on your phone</span>
              </div>
            </div>
          ))}
          {decideError && <p className="mb-2 text-rose-300">Couldn't decide: {decideError}</p>}
          {nextRoutine && (
            <div className="mb-2 text-[11px] text-slate-500">
              Next routine: {nextRoutine.name} ({nextRoutine.schedule}) at {nextRoutine.next_run!.replace('T', ' ')}
            </div>
          )}

          <table className="w-full border-separate border-spacing-y-0.5">
            <tbody>
              {recent.map((r, i) => (
                <tr key={`${r.ts}-${i}`} className="leading-tight">
                  <td className="whitespace-nowrap pr-3 text-slate-500">{timeOf(r.ts)}</td>
                  <td className={`whitespace-nowrap pr-3 font-semibold ${DECISION_STYLE[r.decision]}`}>{r.decision}</td>
                  <td className="whitespace-nowrap pr-3 text-slate-400">{r.method}</td>
                  <td className="max-w-[300px] truncate text-slate-200" title={`${r.host}${r.path}\n${r.reason}`}>
                    {r.host}
                    <span className="text-slate-500">{shortPath(r.path)}</span>
                  </td>
                </tr>
              ))}
              {connected && recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-slate-500">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Html>
    </group>
  );
}
