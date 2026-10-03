/**
 * Projectile motion physics (no drag).
 *
 * With origin at (x0, y0), speed v, angle a above the horizontal, and direction dir
 * (+1 to the right, -1 to the left), for elapsed time τ = t - t0:
 *
 *   x(τ) = x0 + dir · v · cos(a) · τ
 *   y(τ) = y0 + v · sin(a) · τ − g · τ² / 2
 *
 * Eliminating τ, the trajectory is a degree-2 polynomial in x:
 *
 *   y(x) = y0 + dir · tan(a) · (x − x0) − g / (2 v² cos²a) · (x − x0)²
 */

export const G = 9.81; // m/s²

export interface Point {
  x: number;
  y: number;
}

export interface Projectile {
  x0: number;
  y0: number;
  v: number;
  /** Angle above the horizontal, in radians. */
  angle: number;
  dir: 1 | -1;
  /** Instant (s) at which it is fired. */
  t0: number;
}

export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;

export function positionAt(p: Projectile, t: number): Point {
  const tau = Math.max(0, t - p.t0);
  return {
    x: p.x0 + p.dir * p.v * Math.cos(p.angle) * tau,
    y: p.y0 + p.v * Math.sin(p.angle) * tau - 0.5 * G * tau * tau,
  };
}

/** Instantaneous velocity (components) to orient the projectile drawing. */
export function velocityAt(p: Projectile, t: number): Point {
  const tau = Math.max(0, t - p.t0);
  return {
    x: p.dir * p.v * Math.cos(p.angle),
    y: p.v * Math.sin(p.angle) - G * tau,
  };
}

/** Flight duration until returning to ground level (y = 0). */
export function flightTime(p: Projectile): number {
  const vy = p.v * Math.sin(p.angle);
  return (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, p.y0))) / G;
}

/** Horizontal range from the firing point. */
export function range(p: Projectile): number {
  return p.v * Math.cos(p.angle) * flightTime(p);
}

/** Maximum height reached. */
export function apexHeight(p: Projectile): number {
  const vy = p.v * Math.sin(p.angle);
  return p.y0 + (vy * vy) / (2 * G);
}

export interface Quadratic {
  a2: number;
  a1: number;
  a0: number;
}

/** Coefficients of the polynomial y(x) = a2·x² + a1·x + a0 (x measured from the world origin). */
export function polynomialY(p: Projectile): Quadratic {
  const k = G / (2 * p.v * p.v * Math.cos(p.angle) ** 2);
  const tan = Math.tan(p.angle);
  return {
    a2: -k,
    a1: p.dir * tan + 2 * k * p.x0,
    a0: p.y0 - p.dir * tan * p.x0 - k * p.x0 * p.x0,
  };
}

export function formatPolynomial(q: Quadratic, digits = 5): string {
  const sign = (n: number) => (n < 0 ? '−' : '+');
  const abs = (n: number) => Math.abs(n).toFixed(digits);
  return `y(x) = ${q.a2 < 0 ? '−' : ''}${abs(q.a2)}x² ${sign(q.a1)} ${abs(q.a1)}x ${sign(q.a0)} ${abs(q.a0)}`;
}

/** Samples the trajectory between t0 and landing (or tEnd if given). */
export function samplePath(p: Projectile, n = 90, tEnd?: number): Point[] {
  const end = tEnd ?? p.t0 + flightTime(p);
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push(positionAt(p, p.t0 + ((end - p.t0) * i) / n));
  }
  return pts;
}
