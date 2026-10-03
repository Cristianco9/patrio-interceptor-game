import {
  apexHeight,
  flightTime,
  positionAt,
  range,
  rad2deg,
} from './physics/projectile';
import {
  findBracket,
  interceptorFor,
  makeScenario,
  solveWith,
  type Bracket,
  type MissionSolve,
  type Scenario,
} from './numerical/interception';
import { METHOD_INFO, type MethodId } from './numerical/methods';

export type Phase = 'idle' | 'solving' | 'hold' | 'flying' | 'explosion' | 'result';

export interface ViewBounds {
  xMin: number;
  xMax: number;
  yMax: number;
}

export interface Outcome {
  kind: 'hit' | 'nosolution' | 'failed';
  title: string;
  detail: string;
}

export interface Mission {
  id: number;
  scenario: Scenario;
  method: MethodId;
  tol: number;
  bracket: Bracket | null;
  results: Record<MethodId, MissionSolve>;
  result: MissionSolve;
  view: ViewBounds;
  outcome: Outcome;
}

export const METHODS: MethodId[] = ['bisection', 'newton', 'secant'];

/** Scene framing: base, enemy trajectory, and the interceptor's if it exists. */
export function computeBounds(sc: Scenario, phi: number | null): ViewBounds {
  const xMin = -0.05 * sc.baseX;
  const xMax = 1.1 * sc.baseX;
  let maxY = 0;

  const tEnd = flightTime(sc.enemy);
  for (let i = 0; i <= 240; i++) {
    const p = positionAt(sc.enemy, (tEnd * i) / 240);
    if (p.x > xMax) break;
    maxY = Math.max(maxY, p.y);
  }
  if (phi !== null) {
    const ic = interceptorFor(sc, phi);
    const tf = flightTime(ic);
    for (let i = 0; i <= 120; i++) {
      const p = positionAt(ic, ic.t0 + (tf * i) / 120);
      if (p.x < xMin) break;
      maxY = Math.max(maxY, p.y);
    }
  }
  return { xMin, xMax, yMax: Math.max(0.4 * sc.baseX, maxY * 1.18) };
}

function impactNote(sc: Scenario): string {
  const r = range(sc.enemy);
  const near = Math.abs(r - sc.baseX) < 50;
  return near
    ? `The projectile impacts at x = ${r.toFixed(0)} m: base reached.`
    : `The projectile falls at x = ${r.toFixed(0)} m.`;
}

function buildOutcome(sc: Scenario, result: MissionSolve, bracket: Bracket | null): Outcome {
  if (result.hit) {
    const n = result.iterations.length;
    return {
      kind: 'hit',
      title: 'Target neutralized',
      detail:
        `Intercepted at x = ${result.hit.x.toFixed(1)} m, y = ${result.hit.y.toFixed(1)} m, ` +
        `t = ${result.hit.t.toFixed(2)} s. Firing angle ${rad2deg(result.hit.phi).toFixed(3)}° ` +
        `(${n} iterations).`,
    };
  }
  if (bracket === null) {
    return {
      kind: 'nosolution',
      title: 'No firing solution',
      detail: `${result.message} ${impactNote(sc)}`,
    };
  }
  return {
    kind: 'failed',
    title: 'The method did not converge',
    detail: `${result.message} Try another method. ${impactNote(sc)}`,
  };
}

export function buildMission(
  id: number,
  angleDeg: number,
  speed: number,
  method: MethodId,
  tol: number,
  vi: number,
  delay: number,
): Mission {
  const scenario = makeScenario(angleDeg, speed, vi, delay);
  const bracket = findBracket(scenario);
  const results = {
    bisection: solveWith(scenario, 'bisection', bracket, tol),
    newton: solveWith(scenario, 'newton', bracket, tol),
    secant: solveWith(scenario, 'secant', bracket, tol),
  } satisfies Record<MethodId, MissionSolve>;
  const result = results[method];
  return {
    id,
    scenario,
    method,
    tol,
    bracket,
    results,
    result,
    view: computeBounds(scenario, result.hit ? result.hit.phi : null),
    outcome: buildOutcome(scenario, result, bracket),
  };
}

export function methodLabel(id: MethodId): string {
  return METHOD_INFO[id].name;
}

export function threatSummary(sc: Scenario) {
  return {
    range: range(sc.enemy),
    apex: apexHeight(sc.enemy),
    time: flightTime(sc.enemy),
  };
}
