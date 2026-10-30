import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BattleCanvas from './components/BattleCanvas';
import ControlPanel, { type Params, type Side } from './components/ControlPanel';
import IterationLog from './components/IterationLog';
import Telemetry from './components/Telemetry';
import { buildMission, type Mission, type Outcome, type Phase } from './mission';
import { makeScenario } from './numerical/interception';
import type { MethodId } from './numerical/methods';

const DEFAULTS: Params = {
  mode: 'versus', // change back to 'dual' if you prefer the old default
  angle: 45,
  speed: 100,
  pAngle: 40,
  pSpeed: 110,
  vi: 140,
  delay: 1,
  tol: 0.01,
  anim: 1,
};

/** Pause between round 1 and round 2 in dual mode. */
const ROUND_PAUSE_MS = 1600;

export default function App() {
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [method, setMethod] = useState<MethodId>('bisection');
  const [mission, setMission] = useState<Mission | null>(null);
  // Round 2 (Patrio fires, the Attacker responds), queued while round 1 plays (dual mode).
  const [pending, setPending] = useState<Mission | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stats, setStats] = useState({ launches: 0, kills: 0 });

  // Turn-based (versus) mode: the Attacker always goes first, then it alternates.
  const [turn, setTurn] = useState<Side>('attacker');
  const [score, setScore] = useState<Record<Side, number>>({ attacker: 0, patrio: 0 });

  // Latest values for the onPhase callback, which keeps a stable identity.
  const modeRef = useRef(params.mode);
  const missionRef = useRef(mission);
  modeRef.current = params.mode;
  missionRef.current = mission;

  // Preview before launching: shows Patrio's shot when it is the one about to fire.
  const patrioView = params.mode === 'right' || (params.mode === 'versus' && turn === 'patrio');

  const preview = useMemo(
    () =>
      patrioView
        ? makeScenario(params.pAngle, params.pSpeed, params.vi, params.delay, true)
        : makeScenario(params.angle, params.speed, params.vi, params.delay, false),
    [patrioView, params.angle, params.speed, params.pAngle, params.pSpeed, params.vi, params.delay],
  );

  const running = phase === 'solving' || phase === 'hold' || phase === 'flying' || pending !== null;

  const launch = () => {
    setOutcome(null);
    const id = (mission?.id ?? 0) + 1;
    const attackerShot = (n: number) =>
      buildMission(n, params.angle, params.speed, method, params.tol, params.vi, params.delay, false);
    const patrioShot = (n: number) =>
      buildMission(n, params.pAngle, params.pSpeed, method, params.tol, params.vi, params.delay, true);

    if (params.mode === 'versus') {
      setPending(null);
      setMission(turn === 'attacker' ? attackerShot(id) : patrioShot(id));
    } else if (params.mode === 'right') {
      setPending(null);
      setMission(patrioShot(id));
    } else {
      // left / dual: the Attacker fires first; in dual, Patrio's own shot is queued.
      setPending(params.mode === 'dual' ? patrioShot(id + 1) : null);
      setMission(attackerShot(id));
    }
  };

  const reset = () => {
    setPending(null);
    setMission(null);
    setOutcome(null);
    setTurn('attacker');
    setScore({ attacker: 0, patrio: 0 });
  };

  // Dual mode: when round 1 is over, round 2 starts automatically after a short pause.
  useEffect(() => {
    if (phase !== 'result' || !pending) return;
    const next = pending;
    const timer = window.setTimeout(() => {
      setPending(null);
      setOutcome(null);
      setMission(next);
    }, ROUND_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, pending]);

  // Changing the mode, the projectiles or the battery settings after a mission has
  // finished drops it, so the canvas goes back to preview mode for the next launch.
  const handleParams = (next: Partial<Params>) => {
    setParams((prev) => ({ ...prev, ...next }));
    if (next.mode !== undefined) {
      setTurn('attacker');
      setScore({ attacker: 0, patrio: 0 });
    }
    const touchesScenario =
      next.mode !== undefined ||
      next.angle !== undefined ||
      next.speed !== undefined ||
      next.pAngle !== undefined ||
      next.pSpeed !== undefined ||
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

      if (modeRef.current === 'versus') {
        // mirror: true means Patrio was the shooter.
        const shooter: Side = missionRef.current?.scenario.mirror ? 'patrio' : 'attacker';
        const defender: Side = shooter === 'attacker' ? 'patrio' : 'attacker';
        // Interception: the defender scores. Otherwise the shooter scores.
        const winner = out.kind === 'hit' ? defender : shooter;
        setScore((s) => ({ ...s, [winner]: s[winner] + 1 }));
        // Strict alternation: Attacker, Patrio, Attacker, Patrio...
        setTurn(shooter === 'attacker' ? 'patrio' : 'attacker');
      }
    }
  }, []);

  let status = '';
  if (params.mode === 'versus') {
    status =
      turn === 'attacker'
        ? 'Turn: Attacker launches, Patrio responds'
        : 'Turn: Patrio launches, the Attacker responds';
  } else if (mission && params.mode === 'dual') {
    status = mission.scenario.mirror
      ? 'Round 2 of 2: Patrio fires, the Attacker responds'
      : 'Round 1 of 2: the Attacker fires, Patrio responds';
  }

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
          {params.mode === 'versus' ? (
            <>
              <div>
                <dt>Attacker</dt>
                <dd>{score.attacker}</dd>
              </div>
              <div>
                <dt>Patrio</dt>
                <dd>{score.patrio}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Launches</dt>
                <dd>{stats.launches}</dd>
              </div>
              <div>
                <dt>Interceptions</dt>
                <dd>{stats.kills}</dd>
              </div>
            </>
          )}
        </dl>
      </header>

      <main className="layout">
        <aside className="col col--left">
          <ControlPanel
            params={params}
            method={method}
            running={running}
            turn={turn}
            onParams={handleParams}
            onMethod={setMethod}
            onLaunch={launch}
            onReset={reset}
            canReset={mission !== null || params.mode === 'versus'}
            status={status}
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
