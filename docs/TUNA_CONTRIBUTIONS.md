# PR #1 integration

Adapted from [tunapro1234 / FTC #25577 Zağanos — Physics audit fixes, last-season data, clearance envelope, UI cleanup](https://github.com/efeerdogmus0/ftc-biobuzz-shooter-calculator/pull/1), reviewed head `c393ece118361744dd10a7b110b988c0e81d8256`.

The integration preserves this checkout's workbench interface, automatic launch spin, perforated-ball inertia tensor, moving HIVE and resident-ball world. The PR's UI, static HIVE replacement and scalar shell default were not substituted for these components.

## Shooter and saved profiles

- Passive topology makes every hood contact a stationary zero-speed boundary, including the extra rollers. This represents a fixed hood, not freely spinning idler wheels.
- With parallel wheel axes and an unrolled contact path, the roller placement angle no longer projects its tangent rim velocity or torque by a cosine.
- Calibration's common secondary RPM is assigned to all hood rollers, avoiding stale independent-speed values. Independently instrumented roller speeds would require a richer measurement schema.
- The factory surface-speed ratio is 1; the hood/main angular-speed gear ratio remains 3.75. Old profiles receive a ratio-version marker. Only the recognizable old factory default, while still in gear mode, has its dormant 3.75 surface ratio repaired. Custom profiles and explicit surface-mode values retain their settings.
- Saved profiles are validated separately so one malformed entry cannot hide the others.

## Design tools

Open **Tools → Shooter clearance**, **Shot angle study**, or **DECODE reference data**. The Analysis panel has the same shortcuts.

**Clearance:** The initial wheel axis is reconstructed from the active exit point, launch pitch and hood radius. Wheel/ball dimensions and compression come from the current model; local geometry overrides can replace these estimates with CAD values. Shooter contact and the optional perforated launch inertia are recalculated with the effective geometry before deriving the spin/speed ratio.

The envelope contains the circular hood arc and sampled free flight in still air. Every centerline segment is treated as a swept capsule. A requested margin expands its radius in all directions, fixing the upstream case where a point only 5 mm away was reported clear with a 20 mm margin. Vertical sections are evaluated at the requested coordinate rather than snapped to the nearest station. Out-of-domain stations return an explicit unknown result. Orange shows the ball sweep and blue includes the margin.

Results apply only to the traced local paths (0.6 m ahead/above in the UI), not all future motion. The feed path, robot motion, detailed perforated contact geometry and HIVE retention are outside this placement tool. It uses a bounding sphere for the ball and a finite angle/speed sample. Exported stations include the margin.

**Angle study:** Tuna's speed-window and field-grid methods run in a cancellable worker from the current profile. They use the shared pentagonal CELL solids, static inactive cells and frame approximation, and the selected launch inertia regardless of bounce enablement. Speed bounds and sampled HIT trajectories seed windows even when the centered crossing is outside the search range. The target remains fixed. Entry windows are not retention predictions, achievable motor commands or measured probabilities. Coarse angle grids fall back to relative speed tolerance when a local hood-angle derivative cannot be estimated. Export includes the profile, selected ball settings, sampling options and assumptions.

## Legacy measurements

`src/data/legacy2025.ts` preserves the PR's 49 reported DECODE hits, spreadsheet row references, original units and exclusions. Removing the three excluded `2,2` records leaves 46 shots at seven positions. The 41-row lookup table is checked against these raw entries. Recomputed all-shot fit RMSE is approximately 117.1 RPM; this is an in-sample consistency check.

The source spreadsheet is not included. The hardware was a 4 in wheel and fixed hood using a 5 in ARTIFACT and DECODE goal. Hood values are servo commands, not measured exit angles. No direct conversion to BIOBUZZ calibration rows is provided. The reference panel and export identify the season, source and exclusions. Successful hits alone do not establish success probability.

## Optional lift model

The piecewise Sawicki lift option is available under Physics → Aerodynamics. It is a baseball-derived approximation, documented in [Meyer & Bohn, arXiv:0712.0380](https://arxiv.org/html/0712.0380v2), and is uncalibrated for perforated POLLEN. The existing linear law remains the default, including for saved profiles without the new option. Projected-area handling in the moving perforated-ball world is preserved.

## Verification

Regression tests cover stationary hood kinematics, tangent rim velocity, common-RPM calibration, malformed profile recovery, old/custom profile migration, the optional lift curve, raw-data consistency, margin expansion, exact capsule sections and out-of-domain queries. Existing moving-HIVE, multi-ball and automatic-spin tests remain part of the full suite.
