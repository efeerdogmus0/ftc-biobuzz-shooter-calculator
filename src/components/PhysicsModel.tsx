export function PhysicsModel() {
  return (
    <article className="physics-doc">
      <span className="eyebrow">MODEL NOTES / v1</span>
      <h2>Understand the prediction.</h2>
      <p>
        This is an engineering model with explicit unknowns. Numerical
        convergence does not establish real-world accuracy. Measure exit
        velocity, spin and flight positions before trusting competition margins.
      </p>
      <h3>Coordinates & units</h3>
      <p>
        Physics and scene use a Z-up world: X/Y on the floor, meters throughout.
        Chassis heading is counterclockwise from +X; turret yaw is relative to
        chassis. The turret center rotates with chassis; the independent exit
        offset rotates with turret. Default exit Z is exactly 0.347 m.
      </p>
      <code>
        world exit = robot XY + Rz(heading) · turret center + Rz(heading +
        turret yaw) · exit offset
      </code>
      <h3>Finite-friction contact</h3>
      <p>
        Each contact applies a Coulomb-limited impulse to ball translation, ball
        rotation and the wheel. A sticking impulse is limited by effective
        inverse mass, preventing friction from overshooting no-slip equilibrium.
        Equal opposing surface speeds naturally equilibrate toward zero spin.
      </p>
      <code>
        v_surface = ω R<br />
        slip = ω_w R − v_ball − sign · ω_ball r<br />J = clamp(slip / (1/m +
        r²/I_ball + R²/I_wheel), ±μNΔt)
        <br />
        Δv = J/m; Δω_ball = sign · Jr/I_ball; Δω_wheel = −JR/I_wheel
      </code>
      <p>
        Unknown wheel inertia is an explicit ideal-speed boundary. No predicted
        droop, stored energy or recovery is reported in that case. Normal force
        uses series spring stiffness, or your measured compression-force curve.
        Contact length is hood radius times arc. All additional hood rollers are
        simultaneous lumped contacts; their spatial engagement is not resolved.
      </p>
      <h3>ReCalc calibration</h3>
      <p>
        The reference transfer ratio is fit from 7.585 m/s at the two reference
        surface speeds. The wheel energy decrement is fit from the 274 RPM
        reference drop. Spin-up and recovery are independent empirical timing
        anchors, not derived identification of ReCalc internals. Extrapolation
        is not validated. Flight coefficients are never modified to fit these
        values.
      </p>
      <h3>Flight dynamics</h3>
      <code>
        m dv/dt = mg + F_drag + F_Magnus
        <br />u = v − wind; A = πr²
        <br />
        F_drag = −½ρ Cd A |u| u<br />S = |ω|r / |u|; Cl = min(Cl_max, liftSlope
        · S)
        <br />
        F_Magnus = ½ρ Cl A |u|² · unit(ω × u)
        <br />
        dω/dt = −spinDecay · ω
      </code>
      <p>
        Spin parameter uses total spin magnitude; lift vanishes for zero cross
        product. Roughness multiplies Cd only in calibrated POLLEN mode. Air
        density is explicit; the optional derivation uses ideal-gas density with
        an isothermal altitude correction.
      </p>
      <h3>Integration & collisions</h3>
      <p>
        Dormand–Prince RK45 uses embedded 5th/4th order error estimates. Default
        absolute tolerance is 10⁻⁸ SI and relative tolerance 10⁻⁷. Hermite event
        interpolation determines apex, floor and scoring-plane crossing. Swept
        sphere collision uses segment tests against inflated solid boxes;
        corners are conservative. Default 8 ms maximum step bounds gravity-only
        chord sag to roughly 0.08 mm; strong accelerations may require smaller
        steps.
      </p>
      <p>
        A HIT means the ball center crosses inward through the opening eroded by
        its radius, before a solid collision. The CELL bottom stops the
        trajectory. Bounce, retention and HIVE tipping are not simulated, so
        entry is not an official scoring guarantee.
      </p>
      <h3>Energy & motors</h3>
      <code>
        E_ball = ½mv² + ½I_ball ω²
        <br />
        E_wheel = ½I_wheel ω²
        <br />
        τ_motor = Kt · current; back EMF = Kt · ω_motor
      </code>
      <p>
        The contact phase excludes battery input. Slip dissipation follows
        impulse work; deformation and hysteresis are lumped estimates, not
        resolved material constitutive laws. Motor recovery uses current limits,
        voltage sag, gear reduction and efficiency; recovery threshold is 98% of
        commanded speed. Motor constants must be measured for your hardware.
      </p>
      <h3>Optimization & calibration</h3>
      <p>
        Solver samples hood angles and bisects wheel speed using collision-free
        range, then validates against real configured solids and constraints.
        This is a bounded finite search, not a global reachability proof.
        Coverage uses a coarser search. Robustness ranking uses a
        clearance/time/speed proxy; Monte Carlo is the probability estimator.
      </p>
      <p>
        Monte Carlo uses a reproducible seeded PRNG, independent Gaussian
        parameter perturbations, and clamps nonphysical draws. Scatter ellipses
        are covariance-based Gaussian approximations of successful entries only.
        Calibration minimizes Huber-weighted normalized residuals with bounded
        coordinate search. Training and validation are reported separately;
        underdetermined datasets cannot identify all parameters.
      </p>
      <h3>Field provenance</h3>
      <p>
        144 in field and nominal CELL dimensions come from{" "}
        <a
          href="https://ftc-resources.firstinspires.org/ftc/game/manual-09"
          target="_blank"
          rel="noreferrer"
        >
          FIRST ARENA V1, 12 September 2026
        </a>
        . The included single static CELL pose is an editable test fixture. Full
        official frame, second alliance HIVE, flowers, tipping and exact
        internal CAD geometry are not modeled. Visual GLB import does not create
        collision solids.
      </p>
    </article>
  );
}
