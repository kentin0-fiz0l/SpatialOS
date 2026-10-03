/**
 * Agent Activity Panel
 * A board floating in the scene that shows what the agent is doing right now: requests
 * waiting for approval (amber, pulsing) and the most recent watchdog decisions.
 * Read-only: the approve/deny path stays on the phone until it has its own auth.
 */

import { useEffect } from 'react';
import { Html } from '@react-three/drei';
import {
  useWatchdogStore,
  useWatchdogActivity,
  useWatchdogPending,
  useWatchdogConnected,
  type AuditRecord,
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
  const startPolling = useWatchdogStore((s) => s.startPolling);

  useEffect(() => startPolling(), [startPolling]);

  // Newest first, with held-then-decided requests reading as one event each.
  const recent = [...activity].reverse().slice(0, ROWS_SHOWN);

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
              <div className="mt-1 text-[11px] text-amber-200/60">Approve or deny on your phone</div>
            </div>
          ))}

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
