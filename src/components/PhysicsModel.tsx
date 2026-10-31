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
        Accumulated sequential impulses solve the active contacts together. Each
        contact applies a Coulomb-limited impulse to ball translation, ball
        rotation and the wheel. A sticking impulse is limited by effective
        inverse mass, preventing friction from overshooting no-slip equilibrium.
        Equal opposing surface speeds can reduce spin where their contact
        windows overlap; no output spin is imposed by the model.
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
        Contact length is hood radius times arc. Each hood roller has its own
        center, radius, mount angle, compression offset and contact interval;
        only rollers overlapping the ball apply an impulse. Radius is always
        diameter / 2. An incomplete contact transit produces NO EXIT and no
        flight.
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
        F_drag = −½ρ Cd A |u| u<br />S = |ω × unit(u)|r / |u|; Cl = min(Cl_max,
        liftSlope · S)
        <br />
        F_Magnus = ½ρ Cl A |u|² · unit(ω × u)
        <br />
        dL/dt = −spinDecay · L; ω = I_world⁻¹ · L
      </code>
      <p>
        Spin parameter uses only the component perpendicular to airflow, so lift
        approaches zero continuously as spin aligns with airflow. Roughness
        multiplies Cd only in calibrated POLLEN mode. Air density is explicit;
        the optional derivation uses ideal-gas density with an isothermal
        altitude correction.
      </p>
      <h3>Integration & collisions</h3>
      <p>
        Dormand–Prince RK45 uses embedded 5th/4th order error estimates. Default
        absolute tolerance is 10⁻⁸ SI and relative tolerance 10⁻⁷. Hermite event
        interpolation determines apex, floor and scoring-plane crossing. Swept
        CELL collision sweeps a sphere against the same pentagonal wall and
        bottom solids used by the bounce world and renderer. Field obstacle
        boxes remain conservative at corners. Default 8 ms maximum step bounds
        gravity-only chord sag to roughly 0.08 mm; strong accelerations may
        require smaller steps.
      </p>
      <p>
        A HIT means the ball center crosses inward through the opening eroded by
        its radius, before a solid collision. By default the first solid
        collision stops the trajectory. Optional bounce preview continues with a
        coupled contact world with 0–8 resident balls. Fast rigid contacts use
        accumulated impulses and speed-dependent restitution. Optional
        Hertz/Hunt–Crossley contacts calculate force from compression and
        compression rate, producing finite contact duration and elastic energy.
        These are effective point contacts, not resolved shape deformation.
        Surface-specific static/kinetic friction, spin transfer, load-dependent
        rolling and torsional resistance act at contact points. Profile,
        solid-sphere and thin-shell inertia are available.
      </p>
      <p>
        Adaptive substeps are at most 2 ms and one-sixth radius of travel;
        elastic contacts also apply a stiffness-dependent bound. Defaults are a
        1 ms cap and 16 contact iterations. Residents settle until translation
        and spin remain quiet, for up to 5 s; unresolved motion produces a
        warning. Energy and contact diagnostics support step-convergence checks.
        Default material parameters remain unmeasured assumptions. Auto solve
        uses the empty-CELL reference. Optional HIVE dynamics couples both blue
        CELLS to a one-axis hinge with bi-stable balance, effective inertia,
        damping and end stops. Contact velocities include the moving wall
        velocity; equal reaction impulses change HIVE angular momentum. The
        barrier is referenced to a 7.5-POLLEN-equivalent back-skin load, between
        the official seven/no-tip and eight/tip test cases. Actual impulse,
        placement and calibration determine the outcome.
      </p>
      <p>
        The POLLEN proxy uses the 26 radial holes and finite-thickness hollow
        shell from AndyMark CAD. Adjustable ovality and hemisphere clocking
        change the support points. Off-center normal and friction impulses
        change spin; the perforated-shell inertia tensor follows orientation.
        World angular momentum is preserved during free rotation. Projected
        ellipsoid area modifies the flight forces. Cd, Magnus and spin decay
        remain empirical: through-hole flow and shell interlocking are not
        resolved. FLOWER collision and official retention validation remain
        excluded.
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
        The contact phase excludes battery input. Slip dissipation uses the
        complete before/after ball and wheel energy, plus work from any ideal
        speed boundaries. Consumed energy is net wheel energy loss; returned
        energy can be negative. Deformation and hysteresis are separate
        estimates, not resolved material constitutive laws. Motor recovery uses
        current limits, voltage sag, gear reduction and efficiency; recovery
        threshold is 98% of commanded speed. Motor constants must be measured
        for your hardware.
      </p>
      <p>
        Battery sag follows actual supply current. An ideal PWM bridge uses
        I_supply = duty · I_stator and V_motor = duty · V_bus. Current limits
        are totals across the configured motors. Voltage requests use nominal
        bus voltage; regeneration and other robot loads are excluded.
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
        coordinate search. Every row needs an observed outcome. The measured-fit
        badge requires held-out normalized RMSE ≤ 1 and every residual ≤ 2
        (scales: 0.1 m/s, 50 RPM, 10 mm). It covers only the supplied
        observations. Imported/saved profiles reopen unvalidated because they
        contain no measurement evidence; fitted parameters are retained.
        Calibration preserves mechanical linkage and rejects conflicting linked
        RPM inputs. A position after the predicted flight ends cannot validate
        the model. Profiles and history restore the complete physics scenario.
        Underdetermined datasets cannot identify all parameters.
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
        official frame, second alliance HIVE dynamics, FLOWER contacts and exact
        internal CAD geometry are not modeled. Visual GLB import does not create
        collision solids.
      </p>
    </article>
  );
}
