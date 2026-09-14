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

The Coulomb cap supports sliding and the effective-mass clamp supports sticking. Unknown wheel inertia is an ideal-speed boundary: inverse inertia is zero and no measured inertia-dependent metric is claimed. A passive hood has zero surface speed. The default powered hood has three simultaneous 1 in Sushi contacts, gear-linked at the editable 3.75 hood/main RPM ratio; their contact impulses determine ball spin from surface velocity, compression, friction and slip. Contact terminates at traveled hood arc length or the configurable contact time limit; an incomplete transit is warned.

The effective linear stiffness is `1/(1/k_ball + 1/k_wheel)` and normal force is stiffness times compression, reduced by the empirical hysteresis fraction. Alternatively, interpolate the measured compression/normal-force table. This is a lumped compliance model. Slip work is computed from impulse work minus resolved kinetic-energy gain. Elastic and hysteresis energy are estimates, not an integrated deformable-body energy balance.

`I_ball = 0.4*m*r²` only when the user selects the simple solid-sphere default; measured MOI overrides it. Wheel disk MOI similarly requires measured mass and an explicit disk choice.

## ReCalc reference

At reference equal surface speeds, transfer is calibrated so exit speed is 7.585 m/s. The difference in surface speeds determines the ideal debug spin. A separate energy-transfer multiplier fits the primary wheel decrement between 1700 and 1426 RPM at the reference projectile energy change. Timing anchors are 0.323 s spin-up and 0.098 s recovery, scaled with command speed and droop respectively. This is a calibrated response model; it does not reproduce an unknown proprietary implementation. Secondary MOI zero and flywheel mass zero are preserved as supplied. The maximum shown by ReCalc (2463 RPM), effective MOI, kV, kA and kP are retained in the preset/reference data.

## Flight

```
u = v - wind
A = pi*r²
F_drag = -0.5*rho*Cd*A*|u|*u
S = |omega|*r/|u|
Cl = min(liftMax, liftSlope*S)
F_lift = 0.5*rho*Cl*A*|u|²*unit(omega cross u)
dv/dt = (F_drag+F_lift)/m + [0,0,-g]
dp/dt = v
domega/dt = -spinDecay*omega
```

Zero/near-zero direction vectors normalize to zero; this also prevents floating-point underflow at near-perfect spin cancellation. Lift is zero for zero spin or parallel airflow/spin. Roughness is an empirical drag multiplier in calibrated POLLEN mode. The Cl curve is an estimate requiring experiments, not a universal law for POLLEN.

## Numerical method and collision

Dormand–Prince embedded RK5(4), per-component absolute+relative tolerances, adaptive step control. Default absolute 1e-8 SI, relative 1e-7, maximum step 0.008 s. Accepted samples carry position, velocity and spin. Cubic Hermite dense position/velocity with bisection locates apex, floor and inward opening-plane events. Sphere-box CCD uses Minkowski-expanded box slabs between accepted points; this is conservative at corners. Chords approximate curvature, so reduce maxStep for strong forces; 8 ms gravity-only sag is about 0.08 mm.

The scoring opening is the active blue CELL: a local oriented pentagon with a 20 in width, 14 in total height, 7.61 in shoulders and 12.04 in depth. Whole-ball entry erodes its sides, floor and sloped roof by projectile radius. Side walls, back/bottom, arbitrary profile obstacle AABBs and perimeter walls are checked continuously. HIT is entry before contact; the ball then stops at its first solid collision. No restitution, bounce or retention is claimed. If no opening-plane crossing exists, miss distance is closest sampled distance to center, rather than opening clearance.

## Electrical/recovery model

Contact excludes new motor electrical energy. Initial wheel kinetic energy is not called battery energy. Recovery applies torque from back-EMF-limited current, stator/supply power limits, voltage sag, reduction and efficiency. Recovery target is 98% of command. Unknown inertia or an unreachable motor command produces unavailable timing. Motor constants must be independently measured. kA is retained as reference metadata; the physical motor recovery uses inertia and the torque constant explicitly.

## Analysis

Solver samples 25 hood angles (9 for coverage), bisects command speed against collision-free target-plane range, then validates configured collisions and constraints. It returns multiple candidates. This finite search is not proof of global infeasibility and centered range targeting does not exhaust off-center aiming opportunities. Robustness objective is an explicitly labeled proxy; Monte Carlo supplies actual sampled entry probability under the selected uncertainties.

Calibration uses bounded coordinate search with Huber loss. Residual normalization is 0.1 m/s, 50 RPM and 0.01 m. Only training measurements affect fitting. Validation metrics are evaluated after fitting. Parameters may be unidentifiable without varied launch/flight data; friction and stiffness are particularly coupled. Monte Carlo uses independent seeded Gaussian draws; nonphysical parameters are clamped. Its ellipses describe successful-entry samples only and assume approximately Gaussian scatter.
