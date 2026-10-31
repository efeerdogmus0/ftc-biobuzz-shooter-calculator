# POLLEN Shooter Lab — first public web release

A browser simulator for the FTC BIOBUZZ POLLEN shooter: wheel/hood contact
launch, spin and aerodynamic flight, HIVE/CELL geometry, the moving HIVE with
resident POLLEN, Monte Carlo, coverage and measured-shot calibration.

**This is a model, not a measurement.** Default POLLEN, wheel friction, contact
and aerodynamic coefficients are engineering assumptions. Passing software tests
shows internal consistency, not agreement with a real robot. Use the calibration
workflow with your own measured shots before relying on numbers.

## Update: interface modes and robot types

- **Kolay / Orta / Zor (Gelişmiş)** switch in the toolbar. It only changes
  how many controls are shown:
  - **Kolay:** robot type, pose, hood angle, main-wheel RPM, fire, trajectory and bounce.
  - **Orta:** adds wheel/hood coupling, compression and contact, POLLEN, aero,
    field, and the HIVE and contact settings.
  - **Zor:** the full engineering workbench, including analysis, calibration and debug.

  Hidden inputs keep their values, and every mode uses the same configuration
  and solver. The mode is stored separately from scenarios, profiles, share
  links and calibration evidence. New visitors start in Kolay; anyone with saved
  work starts in Zor. Opening a tool from a higher mode (e.g. Auto solve)
  switches the interface up and says so.

- **Robot type** selector (Shooter tab, all modes). It asks for confirmation,
  then replaces only the shooter mechanism; robot pose, field, POLLEN, bounce
  and resident settings are kept. Types:
  - Main wheel + gear-linked powered hood: the current robot's mechanism.
  - Main wheel + independently driven hood.
  - Main wheel + passive (fixed) hood.
  - Opposed top/bottom 96 mm wheels.

  Each is an **unmeasured starting configuration** of the same contact model,
  not a calibrated robot. The existing robot and ReCalc presets are unchanged.

## What is new in this release

### Runs anywhere, stays responsive

- Works from any URL subpath (e.g. GitHub Pages `/<repo>/`), including all workers.
- The shot preview runs in a background worker. Editing or dragging never blocks
  the page. A superseded slow computation is cancelled and only the newest
  configuration's result is shown. A preview that exceeds 20 s is stopped with
  a message naming the limits to relax.
- While a new result is computing, or if it fails, the last good result stays on
  screen and is labelled as belonging to the previous settings. Fire and Play are
  disabled until the current settings have a result.

### Recovery

- If the interface fails, a recovery screen offers: export the active scenario
  as JSON, reset only the active scenario, or try again. Saved named profiles are
  never deleted by any recovery path.
- Open the app with `?reset` (or `#reset`) to discard only the active scenario at
  startup.
- A failing imported CAD (GLB) can be removed from the 3D view's error panel and
  the view retried without reloading.

### Sharing

- **Copy share link** (toolbar and File menu) puts the complete scenario into
  the URL (`#s=1.…`, compressed). Opening the link loads that scenario; invalid
  links are ignored with a notice. Links are size-limited, and the decoded
  scenario is validated exactly like an imported file.

### Calibration evidence you can re-check

- Applying a fit now stores the measured shots used for it, together with a
  fingerprint of the physics settings they were fitted against. They are kept on
  reload, in exported files and in share links.
- The **Measured fit validated** badge is never read from a saved flag. It
  appears only when the current settings match that fingerprint **and** the
  held-out measurements are re-evaluated against the current model and pass
  (normalized RMSE ≤ 1 and every residual ≤ 2). Changing physics or pose shows
  "Measurements were for other settings".
- Measurement input is validated in one place (row count, unique ids, finite and
  bounded values, impact/time consistency) for pasted data, stored evidence,
  shared links and the analysis worker.
- Older profile files still load. They carry no evidence, so they show no
  validated badge.

### Contact physics

- Hertz (Hunt–Crossley) contact: the reported material energy loss is now
  computed as the work of each applied damping impulse, impulse × mean approach
  speed across the kick. The earlier per-step estimate was first-order in the
  step size. This work is still evaluated along the approximate numerical
  trajectory.
  - Measured on a straight CELL back-wall hit at the default step: the energy
    balance error fell from 3.8–8 % to ≤ 0.02 % of the impact energy at 10, 25
    and 40 m/s.
  - At 25 m/s the reported loss differs by less than 0.5 % between the default
    step and a 4×10⁻⁵ s step; at 40 m/s by 0.07 % against 10⁻⁵ s.
  - Trajectories are unchanged; only the bookkeeping and its warnings changed.
- The contact panel shows peak compression as a percentage of the ball radius
  and warns above 15 %. That 15 % is this app's diagnostic warning threshold for
  the point-contact approximation, not a universally established Hertz validity
  limit. The default stiffness is not a measured value.
- Rigid and Hertz are different material laws and may legitimately disagree
  about whether a ball stays in a CELL. The app does not switch between them on
  its own.

## Known limits

- No physical coefficient in the defaults has been measured on the real POLLEN
  or shooter. The calibration badge covers only the supplied launch/flight
  observations: not bounce materials, retention or HIVE dynamics.
- At high impact speeds Hertz contact passes the 15 % compression warning
  threshold with the default stiffness (e.g. ≈ 11 mm at 40 m/s). Treat those
  results with caution unless the stiffness has been measured.
- The main JavaScript bundle is about 1.4 MB (≈410 kB gzip).
