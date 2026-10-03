import { useCallback, useMemo, useState } from 'react';
import BattleCanvas from './components/BattleCanvas';
import ControlPanel, { type Params } from './components/ControlPanel';
import IterationLog from './components/IterationLog';
import Telemetry from './components/Telemetry';
import { buildMission, type Mission, type Outcome, type Phase } from './mission';
import { makeScenario } from './numerical/interception';
import type { MethodId } from './numerical/methods';

const DEFAULTS: Params = { angle: 45, speed: 100, vi: 140, delay: 1, tol: 0.01, anim: 1 };

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [method, setMethod] = useState<MethodId>('bisection');
  const [mission, setMission] = useState<Mission | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stats, setStats] = useState({ launches: 0, kills: 0 });

  const preview = useMemo(
    () => makeScenario(params.angle, params.speed, params.vi, params.delay),
    [params.angle, params.speed, params.vi, params.delay],
  );

  const running = phase === 'solving' || phase === 'hold' || phase === 'flying';

  const launch = () => {
    setOutcome(null);
    setMission((prev) =>
      buildMission(
        (prev?.id ?? 0) + 1,
        params.angle,
        params.speed,
        method,
        params.tol,
        params.vi,
        params.delay,
      ),
    );
  };

  const reset = () => {
    setMission(null);
    setOutcome(null);
  };

  // When a mission has finished animating, changing the enemy projectile (angle/speed)
  // or the battery settings (vi/delay) drops the finished mission so the canvas goes
  // back to preview mode, ready for the next animated launch.
  const handleParams = (next: Partial<Params>) => {
    setParams((prev) => ({ ...prev, ...next }));
    const touchesScenario =
      next.angle !== undefined ||
      next.speed !== undefined ||
      next.vi !== undefined ||
      next.delay !== undefined;
    if (touchesScenario && mission && (phase === 'result' || phase === 'explosion')) {
      setMission(null);
      setOutcome(null);
    }
  };

  const onPhase = useCallback((next: Phase, out: Outcome | null) => {
    setPhase(next);
    if (next === 'explosion' && out) {
      setOutcome(out);
      setStats((s) => ({
        launches: s.launches + 1,
        kills: s.kills + (out.kind === 'hit' ? 1 : 0),
      }));
    }
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16 2v9M16 21v9M2 16h9M21 16h9" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="16" r="2" fill="currentColor" />
          </svg>
          <div>
            <h1>Patrio</h1>
            <p>Antimissile defense with numerical methods</p>
          </div>
        </div>
        <dl className="scoreboard">
          <div>
            <dt>Launches</dt>
            <dd>{stats.launches}</dd>
          </div>
          <div>
            <dt>Interceptions</dt>
            <dd>{stats.kills}</dd>
          </div>
        </dl>
      </header>

      <main className="layout">
        <aside className="col col--left">
          <ControlPanel
            params={params}
            method={method}
            running={running}
            onParams={handleParams}
            onMethod={setMethod}
            onLaunch={launch}
            onReset={reset}
            canReset={mission !== null}
          />
        </aside>

        <section className="col col--center" aria-label="Battlefield">
          <BattleCanvas
            mission={mission}
            preview={preview}
            speed={params.anim}
            onShown={setShown}
            onPhase={onPhase}
          />
        </section>

        <aside className="col col--right">
          <IterationLog mission={mission} shown={shown} phase={phase} />
          <Telemetry
            scenario={mission ? mission.scenario : preview}
            mission={mission}
            phase={phase}
            outcome={outcome}
          />
        </aside>
      </main>
    </div>
  );
}
