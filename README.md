# POLLEN / Shooter Lab

Local React + TypeScript engineering workspace for an FTC turreted flywheel shooter. Includes a standalone SI physics engine, adaptive RK45 flight, finite-friction contact, a ReCalc-calibrated reference, editable 3D field/target volumes, and worker-based analysis.

## Run locally

Requires Node.js 22.12+ and npm. No account, API key, or backend is needed.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Profiles stay in this browser's localStorage; export JSON for a portable backup. No remote fonts or runtime assets are required. Optional field CAD is a self-contained local GLB.

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Browser tests use an isolated Chrome profile. Install Chromium with `npx playwright install chromium` if Chrome is not installed, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to your browser executable. The tests cover drag/pose, SI controls, solver hits/history, ReCalc metrics, 1,000-shot Monte Carlo, coarse field coverage, calibration UI and profile import/export.

Production output is `dist/`. Serve it with any static HTTP server. Workers require HTTP rather than opening `index.html` directly from the filesystem.

## Workflow

1. Load **72mm Rhino + Powered Hood** (72 mm primary, 16 mm powered roller, 3 in / 25 g projectile, exact 347 mm exit height).
2. Drag the robot with the left mouse button; orbit with the mouse. Set X/Y, chassis heading and turret yaw numerically in **Shooter → Robot pose**. **Aim at HIVE** accounts for the exit offset. Optional grid snapping and WASD/QE drive mode are available.
3. Change RPM, hood angle, hood travel and exit position. Wheel coupling supports independent angular speeds, gear ratios and equal/ratio-locked surface speeds.
4. Inspect the trajectory, apex, entry/edge/wall outcome, live metrics and hoverable charts. **Fire shot** stores a configuration and trajectory; select history or a recorded curve to restore it.
5. Run **Auto solve** for angle + RPM candidates, then apply one. Use **Analysis → Evaluate hood range** for a floor heatmap. Fine grids are slow but cancellable.
6. **Monte Carlo consistency** runs 100/1,000/10,000 seeded trials in a worker. Specify measurement uncertainty, inspect entry/floor scatter, and export results.
7. Supply actual measured data to **Measured-shot calibration**. Fit bounded parameters on training rows and inspect separately held-out validation residuals. See [calibration documentation](docs/CALIBRATION.md).
8. Save/duplicate/load profiles, export/import JSON, and use **Debug state** to inspect the complete selected shot. Advanced configuration and explicit collision boxes are editable in **Field → Advanced profile JSON**.

## Physical honesty

- **Uncalibrated** means the empirical material/aerodynamic parameters have not been experimentally fit. Unknown Rhino wheel mass/MOI is stored as `null`, not invented. Contact uses an ideal-speed boundary until inertia is supplied; droop/recovery metrics show “—”.
- **ReCalc-calibrated** is an empirical reference transfer/timing model. Reference output is tested near 7.585 m/s, 0 RPM spin, 1.208 J, 274 RPM drop, 1426 RPM post-shot, 0.323 s spin-up and 0.098 s recovery. These anchors do not identify ReCalc's hidden dynamics.
- **Experimentally calibrated** indicates measured fit parameters were applied with a validation split. It is not a guarantee of predictive accuracy; inspect validation error and parameter identifiability.
- Numerical tolerances and convergence tests concern integration error, not real projectile accuracy.

## Field scope

The official [BIOBUZZ ARENA V1](https://ftc-resources.firstinspires.org/ftc/game/manual-09) and [field resources](https://ftc-resources.firstinspires.org/ftc/archive/2027/field) were consulted on 2026-09-14. The centered HIVE frame, red/blue HIVE spacing, four pentagonal CELLS, published 30° deployed pose, pivot height and active blue CELL are modeled from Section 9 Figures 9-7–9-11. The official CAD remains the fabrication authority. User-requested 3 in / 25 g POLLEN values are preserved despite the manual's differing nominal diameter.

A HIT records inward entry of the entire ball through the active pentagonal blue opening before a solid collision. It does not certify retention or official scoring. Moving HIVE tipping, bounce/retention, sequential spatial roller contact and resolved soft-body deformation remain outside this implementation. GLB import is visual only; add collision boxes explicitly.

## Architecture

- `src/physics`: pure SI contact, flight, aerodynamics, integration, target collision, solver, calibration and Monte Carlo functions; independent of React and Three.js.
- `src/field/fieldConfig.ts`: official V1 field geometry with provenance, including the centered deployed HIVE fixture.
- `src/presets`: current robot/projectile and exact ReCalc input values.
- `src/workers`: heavy analysis; cancellation terminates worker immediately.
- `src/state`: serializable design configuration and UI state.
- `src/scene`: Z-up visualization, robot dragging, camera and shot playback.
- `src/components`: controls, plots, measurement/analysis panels and model notes.
- `src/tests`: numerical, regression, geometric and analysis checks.

See [physics equations and limits](docs/PHYSICS.md), [units](docs/UNITS.md) and [calibration](docs/CALIBRATION.md). Default assumptions are editable. Inspect **Physics model** in the app before using predictions for design decisions.
