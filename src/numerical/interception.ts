/**
 * Interception model.
 *
 *  - The enemy projectile leaves x = 0 at t = 0 with (v, θ) chosen by the player.
 *  - The Patrio battery is at x = baseX and fires to the left at t = delay
 *    (detection and computation time) with fixed speed vi and unknown angle φ.
 *
 * For each angle φ, both projectiles share the same x at time t(φ):
 *
 *   ve·cosθ·t = baseX − vi·cosφ·(t − delay)
 *   ⇒ τ(φ) = t − delay = (baseX − ve·cosθ·delay) / (ve·cosθ + vi·cosφ)
 *
 * The function whose root we seek is the vertical distance between them at that instant:
 *
 *   f(φ) = y_enemy(t(φ)) − y_interceptor(t(φ))
 *
 * f(φ) = 0  ⇒  both projectiles are at the same point at the same time (interception).
 */

import {
  deg2rad,
  positionAt,
  type Point,
  type Projectile,
} from '../physics/projectile';
import {
  bisection,
  newtonRaphson,
  secant,
  type Fn,
  type MethodId,
  type MethodOptions,
  type SolveResult,
} from './methods';

export const BASE_X = 1000; // m, Patrio battery position

/** Allowed angle range for the interceptor. */
export const PHI_MIN = deg2rad(1);
export const PHI_MAX = deg2rad(89);
const SCAN_STEP = deg2rad(2);
const MAX_ITER = 60;

export interface Scenario {
  enemy: Projectile;
  baseX: number;
  /** Interceptor speed (m/s). */
  vi: number;
  /** Firing delay (s). */
  delay: number;
}

export interface Hit {
  phi: number;
  t: number;
  x: number;
  y: number;
}

export interface Bracket {
  a: number;
  b: number;
}

export interface MissionSolve extends SolveResult {
  hit: Hit | null;
}

export function makeScenario(
  angleDeg: number,
  speed: number,
  vi: number,
  delay: number,
  baseX = BASE_X,
): Scenario {
  return {
    enemy: { x0: 0, y0: 0, v: speed, angle: deg2rad(angleDeg), dir: 1, t0: 0 },
    baseX,
    vi,
    delay,
  };
}

export function interceptorFor(sc: Scenario, phi: number): Projectile {
  return { x0: sc.baseX, y0: 0, v: sc.vi, angle: phi, dir: -1, t0: sc.delay };
}

/** τ(φ): interceptor flight time until crossing x with the enemy. */
export function tauFor(sc: Scenario, phi: number): number {
  const vx = sc.enemy.v * Math.cos(sc.enemy.angle);
  return (sc.baseX - vx * sc.delay) / (vx + sc.vi * Math.cos(phi));
}

export interface Crossing {
  t: number;
  enemy: Point;
  interceptor: Point;
}

/** Position of both projectiles at the instant they share an x-coordinate. */
export function crossingFor(sc: Scenario, phi: number): Crossing {
  const t = sc.delay + tauFor(sc, phi);
  return {
    t,
    enemy: positionAt(sc.enemy, t),
    interceptor: positionAt(interceptorFor(sc, phi), t),
  };
}

/** f(φ) in meters (positive: the enemy passes above the interceptor). */
export function gap(sc: Scenario, phi: number): number {
  const c = crossingFor(sc, phi);
  return c.enemy.y - c.interceptor.y;
}

/** Does the crossing occur in the air and after firing? */
function isPhysical(sc: Scenario, phi: number): boolean {
  const tau = tauFor(sc, phi);
  if (!(tau > 0)) return false;
  return crossingFor(sc, phi).enemy.y >= -1e-6;
}

/** The enemy already passed over the base before the interceptor could launch. */
export function enemyPassedBase(sc: Scenario): boolean {
  const vx = sc.enemy.v * Math.cos(sc.enemy.angle);
  return vx * sc.delay >= sc.baseX;
}

/**
 * Angle sweep looking for a sign change in f(φ).
 * Among the intervals with a physical root, choose the one that intercepts first.
 */
export function findBracket(sc: Scenario): Bracket | null {
  if (enemyPassedBase(sc)) return null;
  const f: Fn = (phi) => gap(sc, phi);

  let best: { bracket: Bracket; t: number } | null = null;
  for (let a = PHI_MIN; a < PHI_MAX - 1e-9; a += SCAN_STEP) {
    const b = Math.min(a + SCAN_STEP, PHI_MAX);
    const fa = f(a);
    const fb = f(b);
    if (fa * fb > 0) continue;

    // Approximate root, just to know if it is physically valid and when it occurs.
    let lo = a;
    let hi = b;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    const root = (lo + hi) / 2;
    if (!isPhysical(sc, root)) continue;

    const t = crossingFor(sc, root).t;
    if (best === null || t < best.t) best = { bracket: { a, b }, t };
  }
  return best ? best.bracket : null;
}

/** Runs the chosen method on the scenario. */
export function solveWith(
  sc: Scenario,
  method: MethodId,
  bracket: Bracket | null,
  tol: number,
): MissionSolve {
  if (bracket === null) {
    const message = enemyPassedBase(sc)
      ? 'The projectile already passed the base before the interceptor could launch.'
      : 'No angle allows crossing the enemy trajectory in the air: the target is not interceptable.';
    return { method, converged: false, root: null, iterations: [], message, hit: null };
  }

  const f: Fn = (phi) => gap(sc, phi);
  const opts: MethodOptions = { tol, maxIter: MAX_ITER, domain: [PHI_MIN, PHI_MAX] };

  let result: SolveResult;
  switch (method) {
    case 'bisection':
      result = bisection(f, bracket.a, bracket.b, opts);
      break;
    case 'newton':
      result = newtonRaphson(f, (bracket.a + bracket.b) / 2, opts);
      break;
    case 'secant':
      result = secant(f, bracket.a, bracket.b, opts);
      break;
  }

  if (result.converged && result.root !== null) {
    if (!isPhysical(sc, result.root)) {
      return {
        ...result,
        converged: false,
        root: null,
        hit: null,
        message: 'Converged to a non-physical root: the crossing would occur underground.',
      };
    }
    const c = crossingFor(sc, result.root);
    return {
      ...result,
      hit: { phi: result.root, t: c.t, x: c.enemy.x, y: c.enemy.y },
    };
  }
  return { ...result, hit: null };
}
