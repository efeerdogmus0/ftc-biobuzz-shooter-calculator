# Measured-shot calibration

Do not treat sample/generated data as real measurements. Enter measured shots in **Analysis → Measured-shot calibration** as a JSON array. Each row includes an ID, a split and the measured input settings. Optional observations include exit speed, spin and a position at a known flight time.

```json
[
  {
    "id": "replace-with-real-measurement",
    "split": "training",
    "primaryRPM": 1700,
    "secondaryRPM": 6800,
    "hoodDeg": 65,
    "exitVelocity": 7.2,
    "spinRPM": 0
  },
  {
    "id": "replace-with-independent-measurement",
    "split": "validation",
    "primaryRPM": 1600,
    "secondaryRPM": 6400,
    "hoodDeg": 60,
    "exitVelocity": 6.8,
    "spinRPM": 0
  }
]
```

**These numbers are an illustrative schema, not experimental data.** An optional `impact: [x,y,z]` requires `time` in seconds. Supply `robot` (complete RobotConfig) for shots made at a different pose; otherwise the current robot pose applies. Impact fitting uses free flight up to the specified time, rather than assuming the editable target represents the experimental measurement plane.

1. Measure wheel diameters, ball dimensions/mass, exit offsets and wheel inertia first.
2. Collect varied shots: multiple wheel speeds, hood angles and distances; differential wheel speeds help identify lift/spin effects.
3. Set aside independent validation shots before fitting.
4. Fit a small identifiable parameter subset. Contact friction/stiffness needs unsaturated finite-contact shots; equal-surface-speed no-slip shots cannot identify these uniquely. Cd/lift need flight positions, not only muzzle speed.
5. Inspect initial/fitted values, parameter bounds and training/validation residuals. Exit velocity errors are normalized by 0.1 m/s, spin by 50 RPM, positions by 10 mm.
6. Apply the fitted parameters and export the fit report and resulting profile. A validation split makes the applied status experimentally calibrated, but residuals still determine its usefulness.

The model cannot infer an unknown field pose or unknown ball inertia by silently adjusting drag. Keep measurement provenance and timing uncertainty outside the data array in your experiment log. A fit using only training data does not establish predictive performance.
