import { formatPolynomial, polynomialY, rad2deg } from '../physics/projectile';
import { METHOD_INFO } from '../numerical/methods';
import { BASE_X, type Scenario } from '../numerical/interception';
import { METHODS, threatSummary, type Mission, type Outcome, type Phase } from '../mission';

interface Props {
  scenario: Scenario;
  mission: Mission | null;
  phase: Phase;
  outcome: Outcome | null;
}

export default function Telemetry({ scenario, mission, phase, outcome }: Props) {
  const threat = threatSummary(scenario);
  const poly = formatPolynomial(polynomialY(scenario.enemy));
  const reachesBase = Math.abs(threat.range - BASE_X) < 50;
  const finished = phase === 'result' || phase === 'explosion';

  return (
    <section className="panel" aria-labelledby="tel-title">
      <h2 className="panel__title" id="tel-title">
        Telemetry
      </h2>
      <div className="panel__body">
        {outcome && finished && (
          <div className={`outcome outcome--${outcome.kind}`} role="status">
            <strong>{outcome.title}</strong>
            <p>{outcome.detail}</p>
          </div>
        )}

        <dl className="readout">
          <div>
            <dt>Enemy trajectory</dt>
            <dd className="readout__poly">{poly}</dd>
          </div>
          <div>
            <dt>Range</dt>
            <dd>
              {threat.range.toFixed(1)} m{' '}
              <span className={reachesBase ? 'tag tag--alert' : 'tag'}>
                {reachesBase ? 'threatens the base' : `base at ${BASE_X} m`}
              </span>
            </dd>
          </div>
          <div>
            <dt>Maximum height</dt>
            <dd>{threat.apex.toFixed(1)} m</dd>
          </div>
          <div>
            <dt>Flight time</dt>
            <dd>{threat.time.toFixed(2)} s</dd>
          </div>
        </dl>

        {mission && finished && (
          <>
            <h3 className="subtitle">Method comparison</h3>
            <table className="compare">
              <thead>
                <tr>
                  <th scope="col">Method</th>
                  <th scope="col">Iter.</th>
                  <th scope="col">φ (°)</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((id) => {
                  const r = mission.results[id];
                  return (
                    <tr key={id} className={id === mission.method ? 'is-selected' : ''}>
                      <th scope="row">{METHOD_INFO[id].name}</th>
                      <td>{r.converged ? r.iterations.length : '—'}</td>
                      <td>{r.converged && r.root !== null ? rad2deg(r.root).toFixed(4) : 'no convergence'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <details className="advanced">
          <summary>How the shot is calculated</summary>
          <div className="math">
            <p>
              Each trajectory is a parabola, a degree-2 polynomial in x. For an interceptor angle φ,
              both projectiles share the same x at the instant t(φ). The unknown is obtained by
              zeroing the difference in heights at that instant:
            </p>
            <p className="math__eq">f(φ) = y<sub>enemy</sub>(t(φ)) − y<sub>interceptor</sub>(t(φ))</p>
            <p>
              When f(φ) = 0 the two projectiles coincide in position and time. The chosen method (
              {mission ? METHOD_INFO[mission.method].name : 'bisection, Newton-Raphson, or secant'}) finds
              that root by iterating over φ.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
