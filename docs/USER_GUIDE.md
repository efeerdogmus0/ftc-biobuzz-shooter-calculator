# User guide

Detailed walkthrough of the app. The [README](../README.md) has the overview,
how to run it and the model limits. Some control names below are the Turkish
labels; the app has an EN / TR switch with the same controls in both languages.

## Guided journey (default view)

The default view is one path from "what is my robot?" to "what do I put in my
code?". A six-step rail sits under the toolbar; the 3D field stays in place and
the side panel changes with the step. Each step shows done / needs attention,
and a **Next step** button at the bottom.

| Step           | Question                    | What is there                                                                                                                                                                        |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Robot        | What is my robot?           | Robot card, setup wizard (mechanism, wheels, hood, compression, angle, **chassis and drive**), motor comparison, shooter clearance                                                   |
| 2 Shot         | Does it go in from here?    | Result card, **Auto solve**, wheel speed and launch angle, **Save this point**                                                                                                       |
| 3 Field        | Where can I shoot from?     | Coverage heatmap (click a cell: the robot drives there with that solution), shot angle study (**Use this point**), Limelight view, the list of **shot points**                       |
| 4 Trust        | Will it hold in a match?    | Monte Carlo with ready tolerance presets; the hit rate is written onto the shot point the robot stands on                                                                            |
| 5 Auto         | What do I do in 30 seconds? | Auto planner on this robot (drive type and turret from step 1, saved points as candidates); **Show in simulator** / **Add to shot points** per shot                                  |
| 6 To the robot | What do I put in code?      | Shot table (saved points or a one-angle distance sweep) as **CSV**, **FTC Java** class or print; shots logged on the real robot compared with the simulation; exit-speed calibration |

Everything the steps share — robot, shot points, chassis, logged shots and
calibration evidence — is saved with the robot profile, share link and account.
The calibration badge does not depend on where the robot stands, so moving it
keeps a validated fit. See [calibration](CALIBRATION.md) and the
[auto planner](AUTO_PLANNER.md).

**Expert view** (top right) opens the full workbench below; the guided view and
the workbench use the same analysis tools.

## Expert view workflow

The light desktop workbench has a model explorer, a central 3D/section view,
the Properties sheet, and a telemetry dock with a synchronized numerical table.
Use **View** to show or hide panels, or **Focus 3D view** to expand the scene.
Model-tree entries open the corresponding properties or camera; the cube and
camera buttons change the view. Profiles and all physics tools remain local.

1. Load **96mm Rhino + 3× Sushi Hood** (96 mm goBILDA Rhino main wheel; three 1 in AndyMark Sushi hood wheels at a 3.75 hood/main RPM ratio; 2.8 in / 25 g POLLEN; 347 mm exit height).
2. Drag the robot with the left mouse button; orbit with the mouse. Set X/Y, chassis heading and turret yaw numerically in **Shooter → Robot pose**. **Aim at HIVE** accounts for the exit offset. Optional grid snapping and WASD/QE drive mode are available.
3. Change RPM, hood angle, hood travel and exit position. Wheel coupling supports independent angular speeds, gear ratios and equal/ratio-locked surface speeds.
4. Inspect the trajectory, apex, entry/edge/wall outcome, live metrics and hoverable charts. **Fire shot** stores the trajectory and complete physics scenario: configuration, selected ball/contact/HIVE settings and resident-ball arrangement. Select history to restore the scenario together.
5. Run **Auto solve** for angle + RPM candidates, then apply one. Use **Analysis → Evaluate hood range** for a floor heatmap. Fine grids are slow but cancellable.
6. **Monte Carlo consistency** runs 100/1,000/10,000 seeded trials in a worker. Specify measurement uncertainty, inspect entry/floor scatter, and export results.
7. Supply actual measured data to **Measured-shot calibration** (or log shots in the guided view's **To the robot** step). Fit bounded parameters on training rows and inspect separately held-out validation residuals. See [calibration documentation](CALIBRATION.md).
8. Save/duplicate/load profiles and export/import versioned scenario JSON. Ball/contact/HIVE settings, bounce enablement and exact resident positions round trip with the robot configuration; active scenarios also survive reload. Legacy bare Config files load with default scenario settings. Use **Debug state** to inspect the complete selected shot. **Field → Advanced profile JSON** still edits the Config portion only.

## Bounce laboratory

Enable **Sekiş simülasyonu** to open the **Sekiş** sidebar. Select 0–8 resident
balls in the active blue CELL, choose an explicitly labeled single-row example or **Elle yerleştir**, then
use **CELL yakın plan**, 0.1×–2× playback and the shared scrub timeline.
In manual mode, drag the initial centers in a top-down placement diagram and adjust height; overlapping and out-of-bounds placements are rejected before committing. Released balls settle under gravity before the shot.
The default POLLEN uses a perforated hollow-shell contact proxy; a sphere
reference is also available. Impacts transfer momentum and spin.
The orange first-flight path and colored post-impact segments stay visible in 3D
and in the trajectory graphs. Resident tracks are optional dashed colored paths.
Select an impact to inspect incoming/outgoing speed, surface angle, spin and
kinetic energy change; arrows show both velocities and the contact normal.
Ball-pair incidence uses relative velocity. The final position summary reports
how many residents and whether the incoming ball remain geometrically inside.

Choose **Çoklu rijit temas** for a fast accumulated-impulse solver or **Hertz
esnek temas** for finite-duration, effective Hertz/Hunt–Crossley contacts.
The latter reports compression, peak normal force and contact duration; it
does not resolve the ball's deformed shape. Both models include separate
surface friction, static/kinetic slip transitions, spin transfer and
load-dependent rolling/torsional resistance. Choose profile inertia, a solid
sphere or a thin spherical shell. In POLLEN mode, the profile option computes
the perforated shell's inertia tensor. Visible holes follow integrated rotation.

**Hareketli HIVE ve delikli POLLEN** controls the new coupled mechanism. Both blue
CELLS rotate about their shared pivot with reaction impulses, a bi-stable gravity
barrier, damping and end stops. The wall velocity enters every impact. The
barrier reference lies between seven and eight nominal POLLEN placed at the
back skin; this is a torque model, not an eight-ball animation switch.
Use **8 POLLEN ile yük deneyi** to observe a filled HIVE tipping and releasing
balls. The eight-ball placement is a two-row example. The HIVE angle plot and
tip buttons share the playback timeline with all ball tracks. **Devrilme ve
dökülmeyi oynat** replays the approach to tipping at half speed in the **HIVE**
camera, including the ground. Live counts and individual ball speed/spin use the
same timeline; balls remain free bodies through wall, ball and floor contacts.

The shell uses 26 hole axes from AndyMark CAD, finite wall thickness, adjustable
ovality and independent hemisphere clocking. Contact support moves to a hole
rim, so off-center impulses can generate spin. Exit spin is calculated from
wheel RPM, diameter, coupling, hood contact, compression and friction; there is
no manual spin input. Wheel contact uses the selected ball mass distribution
projected onto the shooter axis, and the world uses that same inertia tensor.
Feed is initially non-rotating; the legacy profile spin field is ignored.
The orientation-dependent inertia tensor and ellipsoid projected area affect
rotation and flight. ReCalc mode retains its empirical surface-speed formula.

Velocity Verlet free flight uses drag, wind, Magnus lift and spin decay.
Adaptive substeps are capped at 2 ms and one-sixth radius of travel; the default
cap is 1 ms, with a stiffness-dependent smaller bound for elastic contacts.
The default is 16 contact iterations. Exact sphere/box closest points include
corner normals; CELL side panels and bottom follow the pentagon. Residents
settle until both translation and rotation remain quiet, for up to 5 s, before
the shot. A warning preserves moving initial states if settling times out.
The simulation runs in a cancellable worker so controls remain responsive.
The robot no-go footprint is excluded as a projectile solid in this preview.
All four CELLS and the rendered support beams, feet and pivot hubs are collision
solids. Disabling HIVE motion freezes the blue pair and its supports at the
selected initial angle; drawing and counts use that same pose. Red CELLS stay
fixed without reacting on the blue hinge. **Field → HIVE support structure**
can disable the frame for an isolated target experiment. The robot-only no-go
volume is excluded from every ball trajectory.
The HIVE balance reference is separate from projectile mass and diameter, so
varying the ball does not automatically rebalance the field.

Expand **Hesap hassasiyeti ve enerji** for step size, energy curves, balance
residual, settling and compression diagnostics. Halve the step to compare
convergence. In rigid mode, a measured drop/rebound-height pair calibrates
restitution at that impact speed. This assumes a horizontal flat material
sample, zero initial spin and negligible air loss.

Material coefficients are **unmeasured assumptions**. Initial layouts are
examples, not measured real ball positions. HIVE inertia, damping and balance
are effective assumptions requiring hardware calibration. Resolved shape
deformation, shell interlocking, through-hole airflow, FLOWER collisions and
validated retention remain out of scope. The other alliance HIVE stays static. Direct-entry
HIT/MISS and Auto solve use the original empty-CELL first-impact reference;
they do not solve the loaded scenario. Preview final-position outcomes are not
an official scoring guarantee. Simulation stops when translation and spin
and the HIVE remain at rest, or at the configurable time limit (default 10 s). It has a
300,000-step safety bound; diagnostic event recording is capped at 400 events.

## Physical honesty

See [moving HIVE and POLLEN model notes](HIVE_AND_POLLEN.md) for source
geometry, calibration, equations and approximation limits.

- **Uncalibrated** means the empirical material/aerodynamic parameters have not been experimentally fit. Unknown Rhino wheel mass/MOI is stored as `null`, not invented. Contact uses an ideal-speed boundary until inertia is supplied; droop/recovery metrics show “—”.
- **ReCalc-calibrated** is an empirical reference transfer/timing model. Reference output is tested near 7.585 m/s, 0 RPM spin, 1.208 J, 274 RPM drop, 1426 RPM post-shot, 0.323 s spin-up and 0.098 s recovery. These anchors do not identify ReCalc's hidden dynamics.
- **Experimentally calibrated** indicates measured fit parameters were applied with a validation split. It is not a guarantee of predictive accuracy; inspect validation error and parameter identifiability.
- Numerical tolerances and convergence tests concern integration error, not real projectile accuracy.

## Field scope

The official [BIOBUZZ ARENA V1](https://ftc-resources.firstinspires.org/ftc/game/manual-09) and [field resources](https://ftc-resources.firstinspires.org/ftc/archive/2027/field) were consulted on 2026-09-14. The centered HIVE frame, red/blue HIVE spacing, four pentagonal CELLS, published 30° deployed pose, pivot height and active blue CELL are modeled from Section 9 Figures 9-7–9-11. The official CAD remains the fabrication authority. POLLEN defaults to the specified 2.8 in / 25 g nominal, while diameter remains editable for measured variation.

Four perimeter FLOWERS are rendered from Section 9.7 / Figure 9-12, with a 4 in upper opening at 21.5 in, four green pipes, a floor retrieval opening and raised backstop. Positions follow the tile seams in Figure 9-2; wall standoff and small hardware are visual approximations. FLOWERS are visual scenery; FLOWER scoring and collision are not simulated.

A HIT records inward entry of the entire ball through the initial static pentagonal blue opening before a solid collision. It does not certify retention or official scoring. The bounce laboratory additionally simulates moving-HIVE contacts; validated retention and resolved soft-body deformation remain outside this implementation. The three hood rollers use explicit local geometry and only engage during positive-overlap contact. GLB import is visual only; add collision boxes explicitly.
