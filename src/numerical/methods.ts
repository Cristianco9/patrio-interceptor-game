/**
 * Numerical methods for finding roots of f(x) = 0.
 * Here the unknown x is the interceptor's firing angle (in radians).
 */

export type MethodId = 'bisection' | 'newton' | 'secant';

export type Fn = (x: number) => number;

export interface IterationRow {
  /** Iteration number. */
  k: number;
  /** Current angle approximation (rad). */
  angle: number;
  /** f(angle): vertical distance between both projectiles when they cross at x (m). */
  fx: number;
  /** Estimated angle error (rad). null in the first row of open methods. */
  err: number | null;
  /** Bisection: interval endpoints. */
  a?: number;
  b?: number;
  /** Newton: derivative f'(x). */
  dfx?: number;
  /** Secant: previous approximation. */
  prev?: number;
}

export interface SolveResult {
  method: MethodId;
  converged: boolean;
  root: number | null;
  iterations: IterationRow[];
  message: string;
}

export interface MethodOptions {
  /** Stopping criterion: |f(x)| < tol (in meters). */
  tol: number;
  maxIter: number;
  /** Allowed domain for the angle (rad). */
  domain: [number, number];
}

export const METHOD_INFO: Record<
  MethodId,
  { name: string; short: string; formula: string; kind: string }
> = {
  bisection: {
    name: 'Bisection',
    short: 'BISECTION',
    formula: 'c = (a + b) / 2',
    kind: 'Closed: requires an interval [a, b] with a sign change',
  },
  newton: {
    name: 'Newton-Raphson',
    short: 'NEWTON-RAPHSON',
    formula: 'xₖ₊₁ = xₖ − f(xₖ) / f′(xₖ)',
    kind: 'Open: starts from an initial approximation and uses the derivative',
  },
  secant: {
    name: 'Secant',
    short: 'SECANT',
    formula: 'xₖ₊₁ = xₖ − f(xₖ)(xₖ − xₖ₋₁) / (f(xₖ) − f(xₖ₋₁))',
    kind: 'Open: uses two approximations, without a derivative',
  },
};

const fail = (method: MethodId, iterations: IterationRow[], message: string): SolveResult => ({
  method,
  converged: false,
  root: null,
  iterations,
  message,
});

const done = (
  method: MethodId,
  iterations: IterationRow[],
  root: number,
  message: string,
): SolveResult => ({ method, converged: true, root, iterations, message });

/** Bisection on [a, b]; requires f(a)·f(b) ≤ 0. */
export function bisection(f: Fn, a0: number, b0: number, opts: MethodOptions): SolveResult {
  let a = a0;
  let b = b0;
  let fa = f(a);
  const fb = f(b);
  const rows: IterationRow[] = [];

  if (fa * fb > 0) {
    return fail('bisection', rows, 'The interval does not bracket a root (f(a) and f(b) have the same sign).');
  }

  for (let k = 1; k <= opts.maxIter; k++) {
    const c = (a + b) / 2;
    const fc = f(c);
    rows.push({ k, angle: c, fx: fc, err: (b - a) / 2, a, b });
    if (Math.abs(fc) < opts.tol) {
      return done('bisection', rows, c, `Converged in ${k} iterations.`);
    }
    if (fa * fc < 0) {
      b = c;
    } else {
      a = c;
      fa = fc;
    }
  }
  return fail('bisection', rows, `Did not reach the tolerance in ${opts.maxIter} iterations.`);
}

/** Newton-Raphson from x0. The derivative is approximated with central differences. */
export function newtonRaphson(f: Fn, x0: number, opts: MethodOptions): SolveResult {
  const h = 1e-6;
  const rows: IterationRow[] = [];
  let x = x0;
  let prev: number | null = null;

  for (let k = 0; k <= opts.maxIter; k++) {
    const fx = f(x);
    const dfx = (f(x + h) - f(x - h)) / (2 * h);
    rows.push({ k, angle: x, fx, err: prev === null ? null : Math.abs(x - prev), dfx });

    if (Math.abs(fx) < opts.tol) {
      return done('newton', rows, x, `Converged in ${k} iterations.`);
    }
    if (!Number.isFinite(dfx) || Math.abs(dfx) < 1e-12) {
      return fail('newton', rows, 'The derivative is nearly zero: cannot take the next step.');
    }
    const next = x - fx / dfx;
    if (!Number.isFinite(next) || next < opts.domain[0] || next > opts.domain[1]) {
      return fail('newton', rows, 'The method diverged: the next angle falls outside the firing range.');
    }
    prev = x;
    x = next;
  }
  return fail('newton', rows, `Did not reach the tolerance in ${opts.maxIter} iterations.`);
}

/** Secant with initial approximations x0 and x1. */
export function secant(f: Fn, x0: number, x1: number, opts: MethodOptions): SolveResult {
  const rows: IterationRow[] = [];
  let xPrev = x0;
  let fPrev = f(xPrev);
  rows.push({ k: 0, angle: xPrev, fx: fPrev, err: null });
  if (Math.abs(fPrev) < opts.tol) {
    return done('secant', rows, xPrev, 'Converged in 0 iterations.');
  }

  let x = x1;
  for (let k = 1; k <= opts.maxIter; k++) {
    const fx = f(x);
    rows.push({ k, angle: x, fx, err: Math.abs(x - xPrev), prev: xPrev });
    if (Math.abs(fx) < opts.tol) {
      return done('secant', rows, x, `Converged in ${k} iterations.`);
    }
    const denom = fx - fPrev;
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-14) {
      return fail('secant', rows, 'f(xₖ) and f(xₖ₋₁) are nearly equal: the secant becomes horizontal.');
    }
    const next = x - (fx * (x - xPrev)) / denom;
    if (!Number.isFinite(next) || next < opts.domain[0] || next > opts.domain[1]) {
      return fail('secant', rows, 'The method diverged: the next angle falls outside the firing range.');
    }
    xPrev = x;
    fPrev = fx;
    x = next;
  }
  return fail('secant', rows, `Did not reach the tolerance in ${opts.maxIter} iterations.`);
}
