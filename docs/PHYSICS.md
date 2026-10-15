# Physics implementation

All state uses meters, kilograms, seconds and radians. The floor is XY, Z points upward. There is no dependency on rendering time.

## Shooter contact

Wheel surface speed is `omega * diameter / 2`. At contact i, `slip = omega_i R_i - v - sign_i omega_ball r`. Primary contact has sign +1; opposite/hood contacts have sign -1. Resolve an impulse

```
J = clamp(slip / (1/m + r²/I_ball + R_i²/I_i), -mu*N*dt, mu*N*dt)
v += J/m
omega_ball += sign_i*J*r/I_ball
omega_i -= J*R_i/I_i
```

In gear-linked mode, a generalized primary shaft uses `I_equivalent = sum(I_i * ratio_i²)`. Each contact applies a reflected impulse to that shaft, so linked wheel speeds maintain their ratios throughout droop. Surface-speed lock sets initial commands without asserting a physical shaft connection.

The Coulomb cap supports sliding and the effective-mass clamp supports sticking. Unknown wheel inertia is an ideal-speed boundary: inverse inertia is zero and no measured inertia-dependent metric is claimed. A passive hood has zero surface speed: in the passive topology the secondary contact and every extra hood roller are fixed surfaces (no rim speed, no torque on the drivetrain). Ideal rolling along a fixed hood gives exit speed ≈ ½ the wheel surface speed and S = ωr/v ≈ 1 of backspin. Each powered Sushi wheel has an explicit local center, radius, angular placement, compression offset and contact interval. The hood path is unrolled along local +X, so placement along the path is the roller center; the mount angle only records angular placement around the hood. Roller axles are parallel to the main wheel, so rim speed is tangent to the path and is not projected by the mount angle. At every integration step its penetration is `Rb + Ri - distance(ballCenter, rollerCenter)` after the configured compression offsets; only rollers with positive penetration apply an impulse. This permits changing #1, #1+#2 and #2+#3 contact combinations along the path. The default three 1 in Sushi wheels are gear-linked at the editable 3.75 hood/main RPM ratio. Contact terminates at traveled hood arc length or the configurable contact time limit; an incomplete transit is warned.

With a fixed normal force the Coulomb cap bounds the wheel's tangential force, so if the contact arc is too short for the ball to reach the rolling (or matched-speed) limit, exit speed is set by `sqrt(2·a·arc)` and stops depending on RPM. The Zağanos 2025-26 preset showed this with the default 8 mm compression (21 N, 9.41 m/s for every RPM); its 1 in compression is a labelled assumption that restores the ≈ ½ surface-speed limit over the measured RPM range.

The effective linear stiffness is `1/(1/k_ball + 1/k_wheel)` and normal force is stiffness times compression, reduced by the empirical hysteresis fraction. Alternatively, interpolate the measured compression/normal-force table. This is a lumped compliance model. Slip work is computed from impulse work minus resolved kinetic-energy gain. Elastic and hysteresis energy are estimates, not an integrated deformable-body energy balance.

Without a measured MOI, `I_ball = (2/3)*m*r²` for a thin hollow shell (POLLEN presets: Gopher ResisDent balls are hollow molded polyethylene, manual §9.8) or `0.4*m*r²` for a solid sphere; measured MOI overrides both. Profiles saved before this option load as solid spheres. The 25 g POLLEN mass is unverified (the manual gives no mass; scaling a ~71 g 5 in ResisDent by surface area suggests ~22 g), so weigh real balls. Wheel disk MOI similarly requires measured mass and an explicit disk choice.

## ReCalc reference

At reference equal surface speeds, transfer is calibrated so exit speed is 7.585 m/s. The difference in surface speeds determines the ideal debug spin. A separate energy-transfer multiplier fits the primary wheel decrement between 1700 and 1426 RPM at the reference projectile energy change. Timing anchors are 0.323 s spin-up and 0.098 s recovery, scaled with command speed and droop respectively. This is a calibrated response model; it does not reproduce an unknown proprietary implementation. Secondary MOI zero and flywheel mass zero are preserved as supplied. The maximum shown by ReCalc (2463 RPM), effective MOI, kV, kA and kP are retained in the preset/reference data.

## Flight

```
u = v - wind
A = pi*r²
F_drag = -0.5*rho*Cd*A*|u|*u
S = |omega|*r/|u|
Cl = min(liftMax, Cl(S))
Cl(S) = 1.5*S                (S < S*)     sawicki (default)
      = 0.09 + liftSlope*S   (S >= S*),   S* = 0.09/(1.5 - liftSlope) = 0.1 at 0.6
Cl(S) = liftSlope*S                       linear (profiles saved before this option)
F_lift = 0.5*rho*Cl*A*|u|²*unit(omega cross u)
dv/dt = (F_drag+F_lift)/m + [0,0,-g]
dp/dt = v
domega/dt = -spinDecay*omega
```

Zero/near-zero direction vectors normalize to zero; this also prevents floating-point underflow at near-perfect spin cancellation. Lift is zero for zero spin or parallel airflow/spin. Roughness is an empirical drag multiplier in calibrated POLLEN mode. The default piecewise Cl(S) is the Sawicki, Hubbard & Stronge baseball fit ([arXiv:0712.0380](https://arxiv.org/pdf/0712.0380)); the 0.35 cap for POLLEN is an uncalibrated estimate. Neither is a measured law for POLLEN; fit `liftSlope`/`liftMax` from flight positions.

## Numerical method and collision

Dormand–Prince embedded RK5(4), per-component absolute+relative tolerances, adaptive step control. Default absolute 1e-8 SI, relative 1e-7, maximum step 0.008 s. Accepted samples carry position, velocity and spin. Cubic Hermite dense position/velocity with bisection locates apex, floor and inward opening-plane events. Sphere-box CCD uses Minkowski-expanded box slabs between accepted points; this is conservative at corners. Chords approximate curvature, so reduce maxStep for strong forces; 8 ms gravity-only sag is about 0.08 mm.

The scoring opening is the active blue CELL: a local oriented pentagon with a 20 in width, 14 in total height, 7.61 in shoulders and 12.04 in depth. Its center (12.75, −15.77, 59.55) in is derived from manual TU01 §9.6: the opening face is 21.455 in (half the 42.91 in assembly) from the 43.95 in pivot along the 30° arm, offset 5.63 in perpendicular to the arm so the corners match the published 53.5/65.6 in opening heights (derivation in `src/field/fieldConfig.ts`). The bottom of the HIVE is 30.6 in above the TILES (Fig. 9-10). Whole-ball entry applies convex-polygon erosion: every edge is evaluated by its inward signed distance and must exceed projectile radius. This gives the sloped roof its normal-direction clearance. Side walls, back/bottom, the HIVE footprint/crossbar AABBs and perimeter walls are checked continuously. Coverage also rejects robot footprints that overlap a HIVE obstacle. HIT is entry before contact; the ball then stops at its first solid collision. No restitution, bounce or retention is claimed. If no opening-plane crossing exists, miss distance is closest sampled distance to center, rather than opening clearance.

## Electrical/recovery model

Contact excludes new motor electrical energy. Initial wheel kinetic energy is not called battery energy. Recovery applies torque from back-EMF-limited current, stator/supply power limits, voltage sag, reduction and efficiency. Recovery target is 98% of command. Unknown inertia or an unreachable motor command produces unavailable timing. Motor constants must be independently measured. kA is retained as reference metadata; the physical motor recovery uses inertia and the torque constant explicitly.

## Analysis

Solver samples 25 hood angles (9 for coverage), bisects command speed against collision-free target-plane range, then validates configured collisions and constraints. It returns multiple candidates. This finite search is not proof of global infeasibility and centered range targeting does not exhaust off-center aiming opportunities. Robustness objective is an explicitly labeled proxy; Monte Carlo supplies actual sampled entry probability under the selected uncertainties.

Calibration uses bounded coordinate search with Huber loss. Residual normalization is 0.1 m/s, 50 RPM and 0.01 m. Only training measurements affect fitting. Validation metrics are evaluated after fitting. Parameters may be unidentifiable without varied launch/flight data; friction and stiffness are particularly coupled. Monte Carlo uses independent seeded Gaussian draws; nonphysical parameters are clamped. Its ellipses describe successful-entry samples only and assume approximately Gaussian scatter.

## Validation

Independent checks run during the physics audit (October 2026); they are not a substitute for measured launches.

- Flight integrator, 7 m/s at 55° from 0.347 m, 0.5 s: vacuum position matches the analytic parabola to 2e-15 m. With drag, and with drag plus linear-model Magnus, it matches SciPy `solve_ivp` DOP853 (rtol 1e-13) to 8e-14 m in position and 1e-13 m/s in velocity; floor-impact time differs by under 5e-12 s.
- Contact kinematic limits (default POLLEN geometry, 1450 RPM main wheel): a passive hood gives exit speed 0.500 of main-wheel surface speed with rolling spin ω·r/v = 1.000; hood surfaces matched to the main-wheel surface speed give 1.000 and zero spin. Both are the rigid rolling limits.
- Contact results do not change with `contactStep` between 1e-5 and 1e-3 m (7.260 m/s at the default).

References: Sawicki, Hubbard & Stronge lift fit ([arXiv:0712.0380](https://arxiv.org/pdf/0712.0380)); Nathan, baseball lift and drag ([arXiv:physics/0605041](https://arxiv.org/abs/physics/0605041)); ReCalc flywheel calculator ([reca.lc/flywheel](https://www.reca.lc/flywheel)); Chief Delphi shooter wheel paper ([chiefdelphi.com/media/papers/2725](https://www.chiefdelphi.com/media/papers/2725)).
