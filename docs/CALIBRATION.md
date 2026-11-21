# Measured-shot calibration

## For students: the "Robota aktar" step

The guided view's last step (**Robota aktar / To the robot**) is where the simulation meets the real robot. Nothing there is measured for you; every number it shows is labelled as simulation until your own shots back it up.

1. **Shot table.** Pick _Atış noktalarım_ (the points saved in the Field step) or _Mesafe taraması_ (the robot backs away from the HIVE along the line it stood on when you started, and is solved at each step). The sweep uses **one launch angle for the whole table** — the angle that scores from the most distances — so only the wheel speed changes and a value read between two rows is still a real solution. Saved points may mix angles; the page warns that interpolating between them can miss.
2. **Take it to the robot.** _CSV_, _Java_ (an FTC `ShotTable` class: `DISTANCE_M`, `WHEEL_RPM`, `LAUNCH_ANGLE_DEG` and a clamped linear `wheelRpm(d)` / `launchAngleDeg(d)`), _Java'yı kopyala_ or _Yazdır_. Distance is the ground distance from the shooter exit to the HIVE centre, as the shot card shows it. The angle is the ball's launch angle, not a servo position. The Java file names no motors or servos. Every export starts with what the numbers are based on (simulation only / validated by N held-out measurements / how many logged shots the simulation predicted).
3. **Log real shots.** _Atış ekle_ adds a row from the robot's current position or a saved point, prefilled with its RPM and angle. Enter what the ball did (in / short / long / rim / did not leave). The simulation replays each row with exactly that pose and command and shows its own outcome beside it ("3 / 4 predictions matched"). This comparison is recomputed every time; it is not stored as a pass flag.
4. **Exit speed (optional).** If you measure the exit speed (e.g. slow-motion video against a ruler) on at least three rows, _Çıkış hızlarıyla modeli düzelt_ fits the launch parameter (`transfer` in ReCalc mode, `friction` in physical mode) on most rows and holds every third row out as a check. Drag is not fitted from exit speed alone. _Düzeltmeyi robota uygula_ applies the fit and stores the rows as calibration evidence.

The shot log is saved with the robot (profile file, share link, account) as `shotLog`.

### What the badge depends on

The stored calibration is `{ stamp, measurements }`. Each stored row carries the robot pose it was taken with, and the stamp (`v2-…`) fingerprints only the robot and ball physics: it leaves out the robot pose and motion and the shot command (wheel speeds, hood angle), which every row supplies itself. So driving the robot, clicking a coverage cell or trying another RPM keeps the badge; changing the shooter geometry, ball, aerodynamics or field target makes it stale. Files saved with the older pose-dependent `v1-…` stamp are upgraded once, while their old stamp still matches the current robot (rows get the pose they were verified at). The badge itself is always recomputed in a worker from the measurements.

## Advanced: measurement JSON

Do not treat sample/generated data as real measurements. Enter measured shots in **Analysis → Measured-shot calibration** (expert view) or under _İleri düzey_ in the Robota aktar step as a JSON array. Each row includes an ID, a split and the measured input settings. Optional observations include exit speed, spin and a position at a known flight time.

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

**These numbers are an illustrative schema, not experimental data.** An optional `impact: [x,y,z]` requires `time` in seconds. Supply `robot` (complete RobotConfig) for shots made at a different pose; otherwise the pose at fit time is stored with the row when the fit is applied. Impact fitting uses free flight up to the specified time, rather than assuming the editable target represents the experimental measurement plane.

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

These are explicit software acceptance thresholds, not statistical confidence bounds. Profile files and share links carry the measurement evidence (stamp + rows, never a pass flag); the badge is re-verified when they are opened. Keep the fit report for your records.

The model cannot infer an unknown field pose or unknown ball inertia by silently adjusting drag. Keep measurement provenance and timing uncertainty outside the data array in your experiment log. A fit using only training data does not establish predictive performance.
