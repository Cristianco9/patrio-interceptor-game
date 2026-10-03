import { useEffect, useState } from 'react';
import { METHOD_INFO, type MethodId } from '../numerical/methods';
import { METHODS } from '../mission';

export interface Params {
  angle: number;
  speed: number;
  vi: number;
  delay: number;
  tol: number;
  anim: number;
}

interface NumFieldProps {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function NumField({ id, label, unit, value, min, max, step, disabled, onChange }: NumFieldProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const commit = () => {
    const n = parseFloat(text.replace(',', '.'));
    if (!Number.isFinite(n)) {
      setText(String(value));
      return;
    }
    const c = clamp(n, min, max);
    onChange(c);
    setText(String(c));
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="field__row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="field__num">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${label} (value)`}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
            }}
          />
          <span className="field__unit">{unit}</span>
        </span>
      </div>
    </div>
  );
}

interface Props {
  params: Params;
  method: MethodId;
  running: boolean;
  onParams: (p: Partial<Params>) => void;
  onMethod: (m: MethodId) => void;
  onLaunch: () => void;
  onReset: () => void;
  canReset: boolean;
}

export const TOLERANCES = [1, 0.1, 0.01, 0.001, 0.0001];

export default function ControlPanel({
  params,
  method,
  running,
  onParams,
  onMethod,
  onLaunch,
  onReset,
  canReset,
}: Props) {
  return (
    <section className="panel" aria-labelledby="mando-title">
      <h2 className="panel__title" id="mando-title">
        Command panel
      </h2>
      <div className="panel__body">
        <fieldset className="group" disabled={running}>
          <legend>Enemy projectile</legend>
          <NumField
            id="angle"
            label="Launch angle"
            unit="°"
            value={params.angle}
            min={5}
            max={85}
            step={1}
            onChange={(angle) => onParams({ angle })}
          />
          <NumField
            id="speed"
            label="Initial speed"
            unit="m/s"
            value={params.speed}
            min={20}
            max={250}
            step={1}
            onChange={(speed) => onParams({ speed })}
          />
        </fieldset>

        <fieldset className="group" disabled={running}>
          <legend>Numerical method</legend>
          <div className="methods" role="radiogroup" aria-label="Numerical method">
            {METHODS.map((id) => (
              <label key={id} className={`method${method === id ? ' method--on' : ''}`}>
                <input
                  type="radio"
                  name="method"
                  value={id}
                  checked={method === id}
                  onChange={() => onMethod(id)}
                />
                <span className="method__name">{METHOD_INFO[id].name}</span>
                <span className="method__formula">{METHOD_INFO[id].formula}</span>
              </label>
            ))}
          </div>
          <div className="field">
            <label htmlFor="tol">Tolerance |f(φ)|</label>
            <select
              id="tol"
              value={params.tol}
              onChange={(e) => onParams({ tol: Number(e.target.value) })}
            >
              {TOLERANCES.map((t) => (
                <option key={t} value={t}>
                  {t} m
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <details className="advanced">
          <summary>Battery settings</summary>
          <fieldset className="group" disabled={running}>
            <NumField
              id="vi"
              label="Interceptor speed"
              unit="m/s"
              value={params.vi}
              min={60}
              max={300}
              step={1}
              onChange={(vi) => onParams({ vi })}
            />
            <NumField
              id="delay"
              label="Firing delay"
              unit="s"
              value={params.delay}
              min={0}
              max={5}
              step={0.1}
              onChange={(delay) => onParams({ delay })}
            />
          </fieldset>
          <div className="field">
            <label htmlFor="anim">Animation speed</label>
            <select
              id="anim"
              value={params.anim}
              onChange={(e) => onParams({ anim: Number(e.target.value) })}
            >
              <option value={0.5}>×0.5</option>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={4}>×4</option>
            </select>
          </div>
        </details>

        <div className="actions">
          <button type="button" className="btn btn--fire" onClick={onLaunch} disabled={running}>
            {running ? 'Mission in progress' : 'Launch projectile'}
          </button>
          <button type="button" className="btn" onClick={onReset} disabled={!canReset && !running}>
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
