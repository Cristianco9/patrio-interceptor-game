import { useEffect, useRef } from 'react';
import { rad2deg } from '../physics/projectile';
import type { IterationRow, MethodId } from '../numerical/methods';
import type { Mission, Phase } from '../mission';

interface Props {
  mission: Mission | null;
  shown: number;
  phase: Phase;
}

const fmt = (n: number) =>
  n !== 0 && Math.abs(n) < 1e-3 ? n.toExponential(2) : n.toFixed(4);

const deg = (rad: number) => rad2deg(rad).toFixed(4);

function extraHeader(method: MethodId): string {
  if (method === 'bisection') return 'Interval [a, b]';
  if (method === 'newton') return "f′(φ)";
  return 'φₖ₋₁';
}

function extraCell(method: MethodId, r: IterationRow): string {
  if (method === 'bisection') return `[${rad2deg(r.a!).toFixed(3)}, ${rad2deg(r.b!).toFixed(3)}]`;
  if (method === 'newton') return r.dfx === undefined ? '—' : fmt(r.dfx);
  return r.prev === undefined ? '—' : deg(r.prev);
}

export default function IterationLog({ mission, shown, phase }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const rows = mission ? mission.result.iterations.slice(0, shown) : [];
  const method = mission?.method ?? 'bisection';

  return (
    <section className="panel" aria-labelledby="log-title">
      <h2 className="panel__title" id="log-title">
        Iteration log
      </h2>
      <div className="panel__body panel__body--flush">
        {!mission && (
          <p className="empty">
            Choose the angle and speed of the enemy projectile and press "Launch projectile". Here
            you will see each approximation of the firing angle.
          </p>
        )}
        {mission && (
          <div className="log" ref={scroller} tabIndex={0} aria-label="Iteration table">
            <table>
              <thead>
                <tr>
                  <th scope="col">k</th>
                  <th scope="col">φ (°)</th>
                  <th scope="col">f(φ) (m)</th>
                  <th scope="col">Error (°)</th>
                  <th scope="col">{extraHeader(method)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.k} className={i === rows.length - 1 && phase === 'solving' ? 'is-latest' : ''}>
                    <td>{r.k}</td>
                    <td>{deg(r.angle)}</td>
                    <td className={r.fx >= 0 ? 'pos' : 'neg'}>
                      {r.fx >= 0 ? '+' : ''}
                      {fmt(r.fx)}
                    </td>
                    <td>{r.err === null ? '—' : r.err < 1e-4 ? r.err.toExponential(1) : deg(r.err)}</td>
                    <td className="log__extra">{extraCell(method, r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="empty">
                {mission.result.iterations.length === 0
                  ? 'No iterations: there is no interval of angles with a solution.'
                  : 'Waiting for the first approximation…'}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
