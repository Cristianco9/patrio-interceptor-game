import { useEffect, useRef } from 'react';
import { flightTime, range } from '../physics/projectile';
import type { Scenario } from '../numerical/interception';
import type { Mission, Outcome, Phase } from '../mission';
import { STEP_SECONDS, drawScene, type ExplosionState } from '../render/scene';

interface Props {
  mission: Mission | null;
  /** Scenario from the controls, for the preview before launching. */
  preview: Scenario;
  /** Animation speed multiplier. */
  speed: number;
  onShown: (n: number) => void;
  onPhase: (phase: Phase, outcome: Outcome | null) => void;
}

const HOLD_SECONDS = 0.9;
const TIME_SCALE = 2; // simulated seconds per real second
const EXPLOSION_TO_RESULT = 0.9;

interface Timeline {
  phase: Phase;
  shown: number;
  acc: number;
  hold: number;
  simT: number;
  explosion: ExplosionState | null;
  explosionAge: number;
  outcome: Outcome | null;
  clock: number;
}

const freshTimeline = (): Timeline => ({
  phase: 'idle',
  shown: 0,
  acc: 0,
  hold: 0,
  simT: 0,
  explosion: null,
  explosionAge: 0,
  outcome: null,
  clock: 0,
});

export default function BattleCanvas({ mission, preview, speed, onShown, onPhase }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeline = useRef<Timeline>(freshTimeline());

  // Latest prop values, to read them from the animation loop.
  const missionRef = useRef(mission);
  const previewRef = useRef(preview);
  const speedRef = useRef(speed);
  const onShownRef = useRef(onShown);
  const onPhaseRef = useRef(onPhase);
  missionRef.current = mission;
  previewRef.current = preview;
  speedRef.current = speed;
  onShownRef.current = onShown;
  onPhaseRef.current = onPhase;

  // Each new mission (or reset) starts the timeline from scratch.
  useEffect(() => {
    const t = (timeline.current = freshTimeline());
    if (mission) {
      t.phase = mission.result.iterations.length > 0 ? 'solving' : 'flying';
    }
    onPhaseRef.current(t.phase, null);
    onShownRef.current(0);
  }, [mission]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      width = Math.max(320, Math.floor(rect.width));
      height = Math.max(260, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const setPhase = (t: Timeline, phase: Phase) => {
      t.phase = phase;
      onPhaseRef.current(phase, t.outcome);
    };

    const update = (dt: number) => {
      const t = timeline.current;
      const m = missionRef.current;
      const sp = speedRef.current;
      t.clock += dt;
      if (!m) return;

      switch (t.phase) {
        case 'solving': {
          t.acc += dt * sp;
          if (t.acc >= STEP_SECONDS) {
            t.acc = 0;
            t.shown += 1;
            onShownRef.current(t.shown);
            if (t.shown >= m.result.iterations.length) {
              t.hold = 0;
              setPhase(t, 'hold');
            }
          }
          break;
        }
        case 'hold': {
          t.hold += dt * sp;
          if (t.hold >= HOLD_SECONDS) setPhase(t, 'flying');
          break;
        }
        case 'flying': {
          t.simT += dt * sp * TIME_SCALE;
          const hit = m.result.hit;
          const landing = flightTime(m.scenario.enemy);
          if (hit && t.simT >= hit.t) {
            t.simT = hit.t;
            t.explosion = { x: hit.x, y: hit.y, kind: 'intercept' };
            t.explosionAge = 0;
            t.outcome = m.outcome;
            setPhase(t, 'explosion');
          } else if (!hit && t.simT >= landing) {
            t.simT = landing;
            t.explosion = { x: range(m.scenario.enemy), y: 0, kind: 'impact' };
            t.explosionAge = 0;
            t.outcome = m.outcome;
            setPhase(t, 'explosion');
          }
          break;
        }
        case 'explosion': {
          t.explosionAge += dt;
          if (t.explosionAge >= EXPLOSION_TO_RESULT) setPhase(t, 'result');
          break;
        }
        case 'result': {
          t.explosionAge += dt;
          break;
        }
        default:
          break;
      }
    };

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);

      const t = timeline.current;
      const m = missionRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, width, height, {
        phase: t.phase,
        mission: m,
        scenario: m ? m.scenario : previewRef.current,
        shown: t.shown,
        simT: t.simT,
        explosion: t.explosion,
        explosionAge: t.explosionAge,
        outcome: t.outcome,
        clock: t.clock,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="battlefield" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Tactical map with the enemy projectile's trajectory and the interceptor's approximations"
      />
      <div className="battlefield__scan" aria-hidden="true" />
    </div>
  );
}
