# Physics implementation

All state uses meters, kilograms, seconds and radians. The floor is XY, Z points upward. There is no dependency on rendering time.

## Shooter contact

Wheel surface speed is `omega * diameter / 2`. At contact i, `slip = omega_i R_i - v - sign_i omega_ball r`. Primary contact has sign +1; opposite/hood contacts have sign -1. Resolve an impulse

```
J_next = clamp(J_accumulated + slip / (1/m + r²/I_ball + R_i²/I_i), -mu*N*dt, mu*N*dt)
dJ = J_next - J_accumulated
v += dJ/m
omega_ball += sign_i*dJ*r/I_ball
omega_i -= dJ*R_i/I_i
```

Within each time step, contacts use the updated common ball/shaft velocities;
iterate until impulse corrections are below 1e-12 N s or 64 iterations.
The accumulated Coulomb limit applies to the entire step, not each iteration.

In gear-linked mode, a generalized primary shaft uses `I_equivalent = sum(I_i * ratio_i²)`. Each contact applies a reflected impulse to that shaft, so linked wheel speeds maintain their ratios throughout droop. Surface-speed lock sets initial commands without asserting a physical shaft connection.

The Coulomb cap supports sliding and the effective-mass clamp supports sticking. Unknown wheel inertia is an ideal-speed boundary: inverse inertia is zero and no measured inertia-dependent metric is claimed. A passive hood has zero surface speed. Each powered Sushi wheel has an explicit local center, angular placement, compression offset and contact interval. Diameter is authoritative; contact radius is diameter/2, and old profile radius aliases are synchronized on import/edit. With parallel roller axles, mount angle describes placement and does not project rim speed. At every integration step penetration is `Rb + Ri - distance(ballCenter, rollerCenter)` after compression offsets; only positive penetration applies an impulse. The default three 1 in Sushi wheels are gear-linked at the editable 3.75 hood/main RPM ratio. Contact ends at the hood arc length or the time limit. An incomplete transit reports `NO EXIT`, suppresses flight/bounce/playback and cannot be accepted by analysis.

The effective linear stiffness is `1/(1/k_ball + 1/k_wheel)` and normal force is stiffness times compression, reduced by the empirical hysteresis fraction. Alternatively, interpolate the measured compression/normal-force table. Slip loss is ideal-speed boundary work plus the complete before/after kinetic-energy difference of the ball and finite wheels, including simultaneous-contact cross terms. Consumed energy is net wheel kinetic-energy loss and may be negative if a fast feed returns energy. Elastic/hysteresis values are separate estimates; they are not added again to consumed energy. This is a lumped force model, not an integrated deformable-body energy balance.

All UI calculations pass the same selected ball model: preview, auto solve, coverage, Monte Carlo, calibration, angle study and clearance. Bounce enablement never changes launch inertia. The perforated shell tensor is projected onto the shooter spin axis; flight energy uses the full oriented tensor. Monte Carlo recomputes it after mass/diameter/pose perturbations. Solid-sphere, thin-shell and explicit inertia overrides remain available. Standalone kernel calls without a ball-model argument retain the profile's scalar-inertia fallback. Wheel disk MOI requires mass and an explicit disk choice. The flight result records its body inertia and aero axes, so charts and headline metrics use the same model with or without bounce.

## ReCalc reference

At reference equal surface speeds, transfer is calibrated so exit speed is 7.585 m/s. The difference in surface speeds determines the ideal debug spin. A separate energy-transfer multiplier fits the primary wheel decrement between 1700 and 1426 RPM at the reference projectile energy change. Timing anchors are 0.323 s spin-up and 0.098 s recovery, scaled with command speed and droop respectively. This is a calibrated response model; it does not reproduce an unknown proprietary implementation. Secondary MOI zero and flywheel mass zero are preserved as supplied. The maximum shown by ReCalc (2463 RPM), effective MOI, kV, kA and kP are retained in the preset/reference data.

## Flight

```
u = v - wind
A = pi*r²
F_drag = -0.5*rho*Cd*A*|u|*u
S = |omega cross unit(u)|*r/|u|
Cl = min(liftMax, liftSlope*S)
F_lift = 0.5*rho*Cl*A*|u|²*unit(omega cross u)
dv/dt = (F_drag+F_lift)/m + [0,0,-g]
dp/dt = v
dL_world/dt = -spinDecay*L_world
omega = I_world(q)^-1 L_world
```

Zero/near-zero direction vectors normalize to zero. The spin parameter uses the transverse component, so lift continuously approaches zero as spin aligns with airflow. Lift direction is perpendicular to both vectors, consistent with [NASA's spinning-ball explanation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-of-a-soccer-ball/). Applying this transverse component to the linear/Sawicki coefficient curves is our model extension, not a measured POLLEN law. Roughness is an empirical drag multiplier in calibrated POLLEN mode; coefficients still require experiments.

For a selected oval ball, both flight engines and the force plots multiply A by
the same orientation-dependent ellipsoid projected-area ratio. World angular
momentum decays analytically as `L(t)=L0 exp(-spinDecay*t)` between impacts;
`omega=I_world(q)^-1 L`. Isotropic bodies have an analytic damped rotation;
asymmetric bodies integrate the quaternion with RK45 in static flight and an
angular-momentum-preserving midpoint update in the contact world. Their numerical
integrators differ, so compare smaller steps. The static step also limits oval
body rotation to 0.2 radians per step. Clearance uses the selected world-frame
orientation and transforms the resulting path into the turret frame.

## Numerical method and collision

Dormand–Prince embedded RK5(4), per-component absolute+relative tolerances, adaptive step control. Default absolute 1e-8 SI, relative 1e-7, maximum step 0.008 s. Accepted samples carry position, velocity and spin. Cubic Hermite dense position/velocity with bisection locates apex, floor and inward opening-plane events. `cellGeometry.ts` supplies five oriented wall prisms and a pentagonal bottom to static flight, bounce, inactive-CELL studies and rendering. CELL CCD uses conservative advancement with exact point-to-solid distance, including rounded sphere/edge/corner contact; field AABBs retain conservative inflated-box slabs. Chords approximate curvature, so reduce maxStep for strong forces; 8 ms gravity-only sag is about 0.08 mm.

The scoring opening is the active blue CELL: a local oriented pentagon with a 20 in width, 14 in total height, 7.61 in shoulders and 12.04 in depth. Whole-ball entry applies convex-polygon erosion: every edge is evaluated by its inward signed distance and must exceed projectile radius. This gives the sloped roof its normal-direction clearance. Side walls, back/bottom, physical HIVE supports and perimeter walls are checked continuously. Coverage also rejects robot footprints that overlap a HIVE obstacle. HIT is entry before contact; the ball then stops at its first solid collision. This remains the empty-CELL scoring/solver reference. Optional coupled bounce preview has a separate contact world described below; it does not certify official retention. Static opening erosion remains a spherical scoring proxy; detailed perforated/oval contact is resolved by the bounce world. If no opening-plane crossing exists, miss distance is closest sampled distance to center, rather than opening clearance.

Obstacle `purpose` separates physical solids from robot-only exclusions and
legacy HIVE proxy boxes. Missing roles migrate from the old factory names;
custom obstacles default to solid. The robot no-go volume never blocks a ball.
`hiveStructure.ts` supplies the renderer, both collision engines and studies
with identical rectangular beams/feet and finite cylindrical pivot hubs. Blue
support arms/hubs follow the hinge and exchange impulses; the A frame and red
supports stay fixed. Static CCD uses exact point-to-OBB/cylinder separation;
contact detection uses that same separation. The old broad crossbar proxy is
replaced by the shared rendered crossbar. `field.hiveStructure=false` disables
these supports for isolated laboratory targets; CELLS remain present. These
are dimensional visual proxies, not an imported full field CAD mesh.

## Electrical/recovery model

Contact excludes new motor electrical energy. Initial wheel kinetic energy is not called battery energy. Recovery targets 98% of command. The ideal PWM bridge solves winding current and battery sag together:

```
R_equivalent = R_motor / motor_count
I_stator = max(0, (duty*V0 - Ke*omega_motor) /
                    (R_equivalent + R_battery*duty²))
I_supply = duty * I_stator
V_bus = V0 - R_battery*I_supply
V_motor = duty * V_bus
tau_shaft = Kt*I_stator*reduction*efficiency
```

Both current limits are aggregate totals across the identical motors. The
controller request `kV*target + kP*(target-speed)` is converted to a duty using
nominal bus voltage; actual winding voltage follows sag. Supply limiting is
applied before stator limiting, with duty reduction satisfying both caps.
Between limits, winding and bus power agree. Motoring current is modeled;
regenerative braking and other robot loads are excluded. Adaptive quadrature
of `dt/domega=J/tau(omega)` reports reachable long recovery times without a
10-second cutoff. Unknown inertia or zero available torque before the target
produces unavailable timing. Motor constants must be independently measured.
kA remains reference metadata.

## Analysis

Solver samples 25 hood angles (9 for coverage), bisects command speed against collision-free target-plane range, then validates configured collisions and constraints. It returns multiple candidates. This finite search is not proof of global infeasibility and centered range targeting does not exhaust off-center aiming opportunities. Robustness objective is an explicitly labeled proxy; Monte Carlo supplies actual sampled entry probability under the selected uncertainties.

The angle-study speed search checks both bounds and sampled HIT paths, with centered crossing roots as additional seeds. It grows windows in fixed 0.05 m/s increments and refines edges to the selected tolerance. It can still miss narrow unsampled windows; it does not prove global infeasibility.

Calibration retains the configured gear/surface/independent linkage. Linked hood
RPM observations must match the configured command within 1 RPM for rounding;
contradictory observations are rejected. Timed positions outside a candidate's
actual free-flight samples are invalid and prevent validation. Playback's
last-sample clamping is not a physics prediction after impact.
Independent extra hood commands are retained unless the row supplies an
explicit `rollerRPMs` array. That array must have one value per extra roller;
linked values are also checked against each roller's ratio.

Profiles use the versioned `pollen-shooter-scenario` envelope containing Config,
ball/contact/HIVE settings, bounce enablement and exact resident count/layout/
CELL-local positions. Save, import/export, startup and history restore all of
these together. Legacy bare Config profiles use default scenario settings,
since their missing historical settings cannot be recovered.

Calibration uses bounded coordinate search with Huber loss. Every row requires an observed exit speed, spin or timed position. Residual normalization is 0.1 m/s, 50 RPM and 0.01 m. Only training observations affect fitting. Held-out normalized RMSE ≤ 1 and maximum absolute normalized residual ≤ 2 are required for the measured-fit badge. These are software acceptance limits, not a statistical confidence claim or validation of unmeasured bounce/HIVE behavior. Saved profiles contain only a legacy boolean and reopen unvalidated, retaining their parameters. Parameters may be unidentifiable without varied data; friction and stiffness are particularly coupled. Monte Carlo uses independent seeded Gaussian draws; nonphysical parameters are clamped. Ellipses describe successful-entry samples only.

## Coupled bounce preview and resident balls

Moving-HIVE coupling, source dimensions, perforated-shell support, tensor
rotation and calibration limits are detailed in [HIVE_AND_POLLEN.md](HIVE_AND_POLLEN.md).

The optional bounce world initializes 0–8 equal-mass POLLEN bodies in non-overlapping
explicit single-row examples or user-defined CELL-local positions in the tilted
active CELL. Warmup stops when both translation and surface-speed-equivalent
rotation stay below 0.015 m/s for 0.25 s, or after 5 s. If warmup times out,
actual velocities are preserved and the UI warns; moving balls are not forced
to rest.
Static solids comprise field walls, shared HIVE supports and explicitly physical
obstacles. Each CELL has five oriented pentagonal panels and a pentagonal bottom
prism; both blue CELLS move with the hinge when enabled.
Both red CELLS are always fixed collision solids, including when blue HIVE
motion is disabled. Only blue contacts exchange impulse with the blue hinge.
Disabling motion freezes the blue pair and its supports at the selected initial
angle. Its constant pose track drives rendering, collision and both occupancy
readouts. Zero residents return an empty layout before checking containment, so
a shallow or small empty target can still be struck from outside.
Closest-point sphere/box contact supplies geometric corner normals. Sphere-pair
contact uses the line of centers and transfers linear and angular momentum.

The fast rigid model uses projected sequential impulses with accumulated
nonnegative normal impulses and vector tangential impulses. The default is 16
iterations (adjustable 4–48). For an isolated fixed surface,
`Jn = -(1+e) m (v dot n)`; for an equal-mass pair,
`Jn = -(1+e) m ((va-vb) dot n)/2`. Restitution varies linearly around an
adjustable reference speed, stays in [0,1], and smoothly vanishes between
0.2 and 0.08 m/s to suppress resting chatter. The low-speed cutoff is a
numerical regularization, not a measured material law.

The optional elastic model applies effective Hertz/Hunt–Crossley normal force:

```
F = K delta^(3/2) max(0, 1 + 1.5 c deltaDot)
U = (2/5) K delta^(5/2)
```

Here K is an effective contact coefficient in N/m^1.5, c is dissipation in s/m,
and deltaDot is positive during compression. Force is clamped to avoid tensile
contact. Identical sphere pairs use K/(2 sqrt(2)) relative to sphere/plane
contact. K and c are unmeasured tunable parameters; the model resolves neither
local shell buckling or detailed shape deformation. This is the
continuous contact law documented by
[Simbody HuntCrossleyForce](https://simbody.github.io/3.5.0/classSimTK_1_1HuntCrossleyForce.html).
Restitution emerges from the elastic/dissipative trajectory; the rigid
restitution sliders do not also act on elastic contacts.

Contact-point velocities include `omega cross arm`. The sticking candidate
lies inside the static friction cone; outside it, kinetic Coulomb friction
opposes slip with a smaller cap. Floor, walls, CELL and ball pairs have separate
kinetic coefficients and an adjustable static/kinetic ratio. Tangential
effective inverse mass is `1/m + r^2/I` per sphere; the generalized model uses
contact arms, the rotating inertia tensor and the hinge Jacobian. Load-dependent rolling and
torsional resistance apply bounded angular impulses proportional to normal
impulse and radius; neither term damps unsupported free flight. Inertia may
follow the profile, a solid sphere (2/5 mr²) or a thin shell (2/3 mr²).
Quaternions integrate spin; visible holes (or reference-sphere stripes) show orientation. Ball-pair impact
angles use relative velocity.

Free flight uses velocity Verlet, wind-relative drag/Magnus forces and spin
decay. Substeps are at most 2 ms and one-sixth radius of travel (default 1 ms
cap). Elastic contact additionally bounds the step from stiffness, effective
mass and estimated compression. Elastic normal forces use two half kicks
around the drift; dissipative terms use the corresponding approach velocities.
This is adaptive stepping, not exact swept
collision against arbitrary meshes. Rigid overlap correction is separate from
velocity impulses; its gravity-work effect is tracked. Elastic contacts retain
their physical-model overlap and do not also receive rigid projection.

All tracks share timestamps. Rigid incoming-shot collisions insert before/after
keyframes; elastic trajectories retain the continuous contact segment. Events
include contact duration, maximum penetration/compression, regime and velocity
changes. Incoming contact-point and surface velocities are captured before the
impulse; outgoing relative velocities use the updated ball and hinge. Observed
restitution divides the outgoing relative normal speed by that recorded
incoming speed, including single-step contacts. Rigid force is J/dt, a step average, and must not be interpreted as
physical peak force. Elastic peak force follows the force-law samples.

Diagnostics track translational, rotational, gravitational and elastic energy,
aerodynamic work, contact impulse work, resistance loss and rigid positional
correction work. For elastic contacts, dissipated normal energy is integrated
independently as `(F - K delta^1.5) deltaDot dt` (including the no-tension
clamp); the total-energy residual compares against this loss plus tangential
work and other losses. Rigid residuals use measured impulse work, so they check
accounting rather than independently validating the contact law. Halving the
step is necessary to assess convergence; a small residual alone does not
validate material coefficients.

The drop/rebound calibration uses `e=sqrt(h_rebound/h_drop)` and
`v_ref=sqrt(2 g h_drop)` on a horizontal flat coupon with no initial spin and
negligible air loss. One pair fits only one speed, not a full material curve.
Elastic stiffness and dissipation need separate measured force/deformation or
contact-time/rebound evidence.

Computation runs in a dedicated worker. Changing settings terminates the old
worker; stale results cannot replace the current scenario. The main preview
is marked as computing until the new result arrives.

Coefficients and initial ball layouts are unmeasured assumptions. Final geometric
CELL occupancy is a preview outcome, not official scoring evidence. Resolved
deformation, FLOWER collision and experimental validation remain excluded.
The direct HIT/MISS and solver use the original empty-CELL reference; loaded-CELL
outcomes are shown separately. The integration has a 300000-step bound and event
logging is capped at 400 diagnostic events.

Manual placement validates whole-ball containment and pair separation before starting.
The UI commits drag changes only on release, then settles the arrangement under gravity.
The single-row preset is explicitly an example; it is not a measured real accumulation
pattern. Seven nominal 2.8-inch balls fit in one row of the current 20-inch CELL without
compressing their diameters, but larger diameters may require a different arrangement.
