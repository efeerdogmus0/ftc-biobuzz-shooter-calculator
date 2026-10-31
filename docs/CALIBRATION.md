# Measured-shot calibration

Do not treat sample/generated data as real measurements. Enter measured shots in **Analysis → Measured-shot calibration** as a JSON array. Each row includes an ID, a split and the measured input settings. Optional observations include exit speed, spin and a position at a known flight time.

```json
[
  {
    "id": "replace-with-real-measurement",
    "split": "training",
    "primaryRPM": 1700,
    "secondaryRPM": 6375,
    "rollerRPMs": [6375, 6375],
    "hoodDeg": 65,
    "exitVelocity": 7.2,
    "spinRPM": 0
  },
  {
    "id": "replace-with-independent-measurement",
    "split": "validation",
    "primaryRPM": 1600,
    "secondaryRPM": 6000,
    "rollerRPMs": [6000, 6000],
    "hoodDeg": 60,
    "exitVelocity": 6.8,
    "spinRPM": 0
  }
]
```

**These numbers are an illustrative schema, not experimental data.** An optional `impact: [x,y,z]` requires `time` in seconds. Supply `robot` (complete RobotConfig) for shots made at a different pose; otherwise the current robot pose applies. Impact fitting uses free flight up to the specified time, rather than assuming the editable target represents the experimental measurement plane.

The example uses the default 3.75 hood/main gear ratio. Calibration preserves the configured linkage and finite shaft inertia. Geared or surface-linked rows must agree with the configured hood RPM within 1 RPM for rounding; contradictory input is rejected. Select independent coupling explicitly only for independent hardware. Passive hood rows require zero hood RPM. Extra geared roller ratios remain configured.

`secondaryRPM` measures the first hood roller only. Optional `rollerRPMs` gives
one measured RPM per extra hood roller in configuration order. When omitted,
the extra independent rollers retain their configured commands; they are never
silently set to `secondaryRPM`. For experiments where all independent hood
drives receive the same changing command, repeat that RPM in `rollerRPMs`.
Linked extra channels must also agree with their individual configured ratios
within 1 RPM. Supply these channels when fitting experiments with different
independent roller commands; the two-channel legacy format cannot describe
changes to every drive.

Timed positions must lie inside the predicted free-flight interval. A candidate whose trajectory has already hit the floor receives an invalid-observation penalty and cannot earn a validation badge. The report names the row and actual flight end time; playback clamping is never used as a later position prediction. Use pre-impact measurements, or a separately validated contact model for post-impact observations.

1. Measure wheel diameters, ball dimensions/mass, exit offsets and wheel inertia first.
2. Collect varied shots: multiple wheel speeds, hood angles and distances; differential wheel speeds help identify lift/spin effects.
3. Set aside independent validation shots before fitting.
4. Fit a small identifiable parameter subset. Contact friction/stiffness needs unsaturated finite-contact shots; equal-surface-speed no-slip shots cannot identify these uniquely. Cd/lift need flight positions, not only muzzle speed.
5. Inspect initial/fitted values, parameter bounds and training/validation residuals. Exit velocity errors are normalized by 0.1 m/s, spin by 50 RPM, positions by 10 mm.
6. Apply fitted parameters and export the fit report and resulting profile. Every row must contain at least one observation. The **Measured fit validated** badge requires a nonempty held-out set, normalized RMSE ≤ 1 and every absolute normalized residual ≤ 2. Merely labeling an input row `validation` is insufficient. The badge covers the supplied launch/flight observations, not bounce materials, retention or HIVE dynamics.

These are explicit software acceptance thresholds, not statistical confidence bounds. Profile files do not contain measurement evidence; saved/imported profiles reopen unvalidated while retaining the fitted parameters. Keep the measurements and fit report for repeat validation.

The model cannot infer an unknown field pose or unknown ball inertia by silently adjusting drag. Keep measurement provenance and timing uncertainty outside the data array in your experiment log. A fit using only training data does not establish predictive performance.
