import {
  flightTime,
  positionAt,
  rad2deg,
  samplePath,
  velocityAt,
  type Projectile,
} from '../physics/projectile';
import { crossingFor, interceptorFor, type Scenario } from '../numerical/interception';
import { computeBounds, type Mission, type Outcome, type Phase, type ViewBounds } from '../mission';

export interface ExplosionState {
  x: number;
  y: number;
  kind: 'intercept' | 'impact';
}

export interface Frame {
  phase: Phase;
  mission: Mission | null;
  /** Scenario to draw: the mission's or the control preview. */
  scenario: Scenario;
  /** Visible iteration rows. */
  shown: number;
  /** Simulated time (s). */
  simT: number;
  explosion: ExplosionState | null;
  explosionAge: number;
  outcome: Outcome | null;
  /** Free clock for blinking. */
  clock: number;
}

const COLOR = {
  bg0: '#0b0f08',
  bg1: '#18210f',
  ridgeFar: '#141b0d',
  ridgeNear: '#1b2512',
  grid: 'rgba(154,255,107,0.065)',
  gridMajor: 'rgba(154,255,107,0.15)',
  ground: '#222b14',
  groundTop: '#86a354',
  phosphor: '#9aff6b',
  amber: '#ffb000',
  red: '#ff4d3d',
  text: '#b7d48c',
  textDim: '#6f8750',
};

const FONT_MONO = "'Share Tech Mono', 'Courier New', monospace";
const FONT_STENCIL = "'Black Ops One', Impact, 'Arial Black', sans-serif";

export const STEP_SECONDS = 0.5;

interface Transform {
  s: number;
  ox: number;
  oy: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
}

function makeTransform(w: number, h: number, b: ViewBounds): Transform {
  const padL = 58;
  const padR = 22;
  const padT = 58;
  const padB = 62;
  const s = Math.min((w - padL - padR) / (b.xMax - b.xMin), (h - padT - padB) / b.yMax);
  const contentW = (b.xMax - b.xMin) * s;
  const ox = padL + (w - padL - padR - contentW) / 2 - b.xMin * s;
  const oy = h - padB;
  return { s, ox, oy, sx: (x) => ox + x * s, sy: (y) => oy - y * s };
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const m = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return m * pow;
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, T: Transform) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, COLOR.bg0);
  g.addColorStop(1, COLOR.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Distant ridges
  const ridge = (base: number, amp: number, freq: number, phase: number, fill: string) => {
    ctx.beginPath();
    ctx.moveTo(0, T.oy);
    for (let x = 0; x <= w; x += 8) {
      const y =
        T.oy -
        base -
        amp * (0.55 * Math.sin(x * freq + phase) + 0.3 * Math.sin(x * freq * 2.3 + phase * 1.7) + 0.15);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, T.oy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  ridge(34, 26, 0.006, 1.2, COLOR.ridgeFar);
  ridge(14, 16, 0.011, 3.4, COLOR.ridgeNear);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, T: Transform, b: ViewBounds) {
  const xStep = niceStep((b.xMax - b.xMin) / 9);
  const yStep = xStep;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = `11px ${FONT_MONO}`;
  ctx.fillStyle = COLOR.textDim;

  for (let x = Math.ceil(0 / xStep) * xStep; x <= b.xMax; x += xStep) {
    const major = Math.round(x / xStep) % 5 === 0;
    ctx.strokeStyle = major ? COLOR.gridMajor : COLOR.grid;
    const px = Math.round(T.sx(x)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(px, 40);
    ctx.lineTo(px, T.oy);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`${x}`, px, T.oy + 38);
  }
  for (let y = yStep; y <= b.yMax; y += yStep) {
    const major = Math.round(y / yStep) % 5 === 0;
    ctx.strokeStyle = major ? COLOR.gridMajor : COLOR.grid;
    const py = Math.round(T.sy(y)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(34, py);
    ctx.lineTo(w - 12, py);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(`${y}`, 48, py + 4);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText('m', 34, 52);
  ctx.textAlign = 'right';
  ctx.fillText('x (m)', w - 14, T.oy + 38);
  ctx.restore();
  void h;
}

function drawGround(ctx: CanvasRenderingContext2D, w: number, h: number, T: Transform) {
  ctx.save();
  ctx.fillStyle = COLOR.ground;
  ctx.fillRect(0, T.oy, w, h - T.oy);
  ctx.beginPath();
  ctx.rect(0, T.oy, w, h - T.oy);
  ctx.clip();
  ctx.strokeStyle = 'rgba(134,163,84,0.14)';
  ctx.lineWidth = 1;
  for (let x = -h; x < w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + (h - T.oy), T.oy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = COLOR.groundTop;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, T.oy);
  ctx.lineTo(w, T.oy);
  ctx.stroke();
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  T: Transform,
  pts: { x: number; y: number }[],
) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = T.sx(p.x);
    const py = T.sy(Math.max(0, p.y));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function drawLauncher(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  angle: number,
  dir: 1 | -1,
  body: string,
  label: string,
  clock: number,
  active: boolean,
) {
  ctx.save();
  ctx.translate(px, py);
  // Tracks
  ctx.fillStyle = '#10150a';
  ctx.beginPath();
  ctx.roundRect(-26, -11, 52, 11, 5);
  ctx.fill();
  ctx.fillStyle = '#2a3519';
  for (let i = -20; i <= 20; i += 10) {
    ctx.beginPath();
    ctx.arc(i, -5.5, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hull
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-22, -11);
  ctx.lineTo(-17, -22);
  ctx.lineTo(17, -22);
  ctx.lineTo(22, -11);
  ctx.closePath();
  ctx.fill();
  // Turret and barrel
  ctx.translate(0, -22);
  ctx.rotate(-(dir === 1 ? angle : Math.PI - angle));
  ctx.fillStyle = '#10150a';
  ctx.fillRect(-4, -5.5, 44, 11);
  ctx.fillStyle = body;
  ctx.fillRect(-4, -4, 42, 8);
  ctx.fillStyle = '#10150a';
  ctx.fillRect(34, -5.5, 6, 11);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = body === '#5c6e36' ? COLOR.text : COLOR.red;
  ctx.font = `11px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(label, px, py + 18);
  if (active) {
    // Status light
    const on = Math.floor(clock * 3) % 2 === 0;
    ctx.fillStyle = on ? COLOR.amber : '#4a3a10';
    ctx.beginPath();
    ctx.arc(px + 20, py - 26, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawMissile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  heading: number,
  body: string,
  nose: string,
  flame: boolean,
  clock: number,
) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(heading);
  if (flame) {
    const len = 9 + 4 * Math.sin(clock * 40);
    const g = ctx.createLinearGradient(-8, 0, -8 - len, 0);
    g.addColorStop(0, 'rgba(255,200,80,0.95)');
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7, -2.5);
    ctx.lineTo(-8 - len, 0);
    ctx.lineTo(-7, 2.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = body;
  ctx.fillRect(-8, -2.6, 13, 5.2);
  ctx.fillStyle = nose;
  ctx.beginPath();
  ctx.moveTo(5, -2.6);
  ctx.lineTo(11, 0);
  ctx.lineTo(5, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-8, -2.6);
  ctx.lineTo(-11, -6);
  ctx.lineTo(-4, -2.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-8, 2.6);
  ctx.lineTo(-11, 6);
  ctx.lineTo(-4, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  T: Transform,
  p: Projectile,
  tNow: number,
  rgb: string,
  span: number,
) {
  const start = Math.max(p.t0, tNow - span);
  if (tNow <= start) return;
  const n = 28;
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = positionAt(p, start + ((tNow - start) * i) / n);
    const b = positionAt(p, start + ((tNow - start) * (i + 1)) / n);
    ctx.strokeStyle = `rgba(${rgb},${(0.08 + 0.7 * ((i + 1) / n) ** 1.6).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(T.sx(a.x), T.sy(Math.max(0, a.y)));
    ctx.lineTo(T.sx(b.x), T.sy(Math.max(0, b.y)));
    ctx.stroke();
  }
  ctx.restore();
}

function drawReticle(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  clock: number,
  color: string,
) {
  const r = 16 + 2 * Math.sin(clock * 5);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(px + dx * (r - 5), py + dy * (r - 5));
    ctx.lineTo(px + dx * (r + 9), py + dy * (r + 9));
    ctx.stroke();
  }
  ctx.restore();
}

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  age: number,
  kind: 'intercept' | 'impact',
) {
  const life = 2.4;
  if (age > life) return;
  const a = age / life;
  ctx.save();
  if (age < 0.16) {
    const k = 1 - age / 0.16;
    ctx.fillStyle = `rgba(255,255,255,${(0.9 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, 22 + 60 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  const alpha = Math.max(0, 1 - a * 1.15);
  const r = 16 + 50 * Math.sqrt(a);
  const g = ctx.createRadialGradient(px, py, 0, px, py, r);
  g.addColorStop(0, `rgba(255,244,180,${alpha.toFixed(3)})`);
  g.addColorStop(0.45, `rgba(255,130,30,${(alpha * 0.85).toFixed(3)})`);
  g.addColorStop(1, 'rgba(110,20,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle =
    kind === 'intercept'
      ? `rgba(154,255,107,${(0.9 * (1 - a)).toFixed(3)})`
      : `rgba(255,170,60,${(0.9 * (1 - a)).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(px, py, 12 + 140 * a ** 0.6, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.6;
  for (let i = 0; i < 26; i++) {
    const ang = (i * Math.PI * 2) / 26 + Math.sin(i * 12.9898) * 0.4;
    const spd = 70 + (Math.sin(i * 78.233) * 0.5 + 0.5) * 150;
    const d = spd * age * (1 - 0.5 * a);
    const sx = px + Math.cos(ang) * d;
    const sy = py + Math.sin(ang) * d + 55 * age * age;
    ctx.strokeStyle = `rgba(255,${180 + (i % 3) * 25},90,${(1 - a).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx - Math.cos(ang) * 6, sy - Math.sin(ang) * 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCorners(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const s = 18;
  const m = 8;
  ctx.save();
  ctx.strokeStyle = 'rgba(154,255,107,0.55)';
  ctx.lineWidth = 2;
  for (const [cx, cy, dx, dy] of [
    [m, m, 1, 1],
    [w - m, m, -1, 1],
    [m, h - m, 1, -1],
    [w - m, h - m, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * s);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * s, cy);
    ctx.stroke();
  }
  ctx.restore();
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Awaiting fire order',
  solving: 'Computing firing solution',
  hold: 'Solution locked',
  flying: 'Projectiles in flight',
  explosion: 'Impact',
  result: 'Mission complete',
};

export function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, f: Frame) {
  const sc = f.scenario;
  const m = f.mission;
  const bounds = m ? m.view : computeBounds(sc, null);
  const T = makeTransform(w, h, bounds);
  const rows = m ? m.result.iterations : [];
  const hit = m ? m.result.hit : null;

  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, T);
  drawGrid(ctx, w, h, T, bounds);
  drawGround(ctx, w, h, T);

  const enemy = sc.enemy;
  const enemyLanding = flightTime(enemy);
  const showingSolution = f.phase === 'solving' || f.phase === 'hold';
  const flightStarted = f.phase === 'flying' || f.phase === 'explosion' || f.phase === 'result';

  // Predicted enemy trajectory (degree-2 polynomial in x)
  ctx.save();
  ctx.setLineDash([7, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = flightStarted ? 'rgba(255,77,61,0.28)' : 'rgba(255,77,61,0.7)';
  strokePath(ctx, T, samplePath(enemy, 120));
  ctx.restore();

  // Interceptor approximations, one per iteration
  const shown = Math.min(f.shown, rows.length);
  for (let i = 0; i < shown; i++) {
    const row = rows[i];
    const latest = i === shown - 1 && showingSolution;
    const ic = interceptorFor(sc, row.angle);
    const cross = crossingFor(sc, row.angle);
    const fade = flightStarted ? 0.1 : latest ? 1 : 0.14 + 0.3 * ((i + 1) / shown);

    ctx.save();
    ctx.lineWidth = latest ? 2.2 : 1.3;
    ctx.strokeStyle = `rgba(255,176,0,${fade.toFixed(3)})`;
    strokePath(ctx, T, samplePath(ic, 110));
    ctx.restore();

    if (!flightStarted) {
      const ex = T.sx(cross.enemy.x);
      const ey = T.sy(cross.enemy.y);
      const iy = T.sy(cross.interceptor.y);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(255,98,80,${(latest ? 0.95 : fade * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex, iy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,176,0,${Math.min(1, fade + 0.2).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ex, iy, latest ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,98,80,${Math.min(1, fade + 0.2).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ex, ey, latest ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (latest) {
        ctx.font = `12px ${FONT_MONO}`;
        ctx.fillStyle = COLOR.amber;
        ctx.textAlign = ex > w * 0.7 ? 'right' : 'left';
        const lx = ex + (ex > w * 0.7 ? -10 : 10);
        ctx.fillText(
          `k=${row.k}  φ=${rad2deg(row.angle).toFixed(3)}°  f=${row.fx >= 0 ? '+' : ''}${row.fx.toFixed(3)} m`,
          lx,
          (ey + iy) / 2 + 4,
        );
      }
      ctx.restore();
    }
  }

  // Final solution
  if (hit) {
    const finalPhi = hit.phi;
    const converged = f.phase !== 'idle' && f.phase !== 'solving';
    if (converged) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(154,255,107,0.55)';
      strokePath(ctx, T, samplePath(interceptorFor(sc, finalPhi), 110, hit.t));
      ctx.restore();
      if (f.phase === 'hold' || f.phase === 'flying') {
        const px = T.sx(hit.x);
        const py = T.sy(hit.y);
        drawReticle(ctx, px, py, f.clock, COLOR.phosphor);
        ctx.save();
        ctx.font = `12px ${FONT_MONO}`;
        ctx.fillStyle = COLOR.phosphor;
        ctx.textAlign = 'left';
        ctx.fillText(`(${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}) m`, px + 26, py - 14);
        ctx.restore();
      }
    }
  }

  // Launchers
  let batteryAngle = Math.PI / 4;
  if (shown > 0) batteryAngle = rows[shown - 1].angle;
  if (hit && flightStarted) batteryAngle = hit.phi;
  drawLauncher(
    ctx,
    T.sx(0),
    T.sy(0),
    enemy.angle,
    1,
    '#6e3a2f',
    'Enemy origin',
    f.clock,
    false,
  );
  drawLauncher(
    ctx,
    T.sx(sc.baseX),
    T.sy(0),
    batteryAngle,
    -1,
    '#5c6e36',
    'Patrio',
    f.clock,
    f.phase === 'solving',
  );

  // Projectiles in flight
  if (flightStarted) {
    const tHit = hit ? hit.t : enemyLanding;
    const t = Math.min(f.simT, tHit);

    // After impact or interception there are no more projectiles to draw.
    if (f.phase === 'flying') {
      drawTrail(ctx, T, enemy, t, '255,110,90', 1.6);
      const pe = positionAt(enemy, t);
      const ve = velocityAt(enemy, t);
      drawMissile(
        ctx,
        T.sx(pe.x),
        T.sy(Math.max(0, pe.y)),
        Math.atan2(-ve.y, ve.x),
        '#d9d2bd',
        COLOR.red,
        false,
        f.clock,
      );
    }

    if (hit && f.phase === 'flying' && t > sc.delay) {
      const ic = interceptorFor(sc, hit.phi);
      drawTrail(ctx, T, ic, t, '154,255,107', 1.6);
      const pi = positionAt(ic, t);
      const vi = velocityAt(ic, t);
      drawMissile(
        ctx,
        T.sx(pi.x),
        T.sy(Math.max(0, pi.y)),
        Math.atan2(-vi.y, vi.x),
        '#cfe3b0',
        COLOR.phosphor,
        true,
        f.clock,
      );
    }
  }

  if (f.explosion) {
    drawExplosion(ctx, T.sx(f.explosion.x), T.sy(f.explosion.y), f.explosionAge, f.explosion.kind);
  }

  // HUD overlay
  drawCorners(ctx, w, h);
  ctx.save();
  ctx.font = `13px ${FONT_MONO}`;
  ctx.textAlign = 'left';
  const blink = Math.floor(f.clock * 2) % 2 === 0;
  ctx.fillStyle =
    f.phase === 'solving' || f.phase === 'flying' ? COLOR.amber : f.phase === 'idle' ? COLOR.text : COLOR.phosphor;
  ctx.fillText(`${blink || f.phase === 'idle' ? '■' : '□'} ${PHASE_LABEL[f.phase]}`, 24, 30);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOR.text;
  ctx.fillText(
    flightStarted ? `T+ ${Math.min(f.simT, hit ? hit.t : enemyLanding).toFixed(2)} s` : 'T+ --.-- s',
    w - 24,
    30,
  );
  ctx.restore();

  if (f.phase === 'result' && f.outcome) {
    const ok = f.outcome.kind === 'hit';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `30px ${FONT_STENCIL}`;
    ctx.shadowColor = ok ? 'rgba(154,255,107,0.7)' : 'rgba(255,77,61,0.7)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = ok ? COLOR.phosphor : COLOR.red;
    ctx.fillText(f.outcome.title.toUpperCase(), w / 2, h * 0.3);
    ctx.restore();
  }
}
