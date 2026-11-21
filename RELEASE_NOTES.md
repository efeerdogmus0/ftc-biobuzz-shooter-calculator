# POLLEN Shooter Lab — first public web release

A browser simulator for the FTC BIOBUZZ POLLEN shooter: wheel/hood contact
launch, spin and aerodynamic flight, HIVE/CELL geometry, the moving HIVE with
resident POLLEN, Monte Carlo, coverage and measured-shot calibration.

**This is a model, not a measurement.** Default POLLEN, wheel friction, contact
and aerodynamic coefficients are engineering assumptions. Passing software tests
shows internal consistency, not agreement with a real robot. Use the calibration
workflow with your own measured shots before relying on numbers.

## Update: one journey from robot to robot code

- The default view is a six-step rail: Robot · Shot · Field · Trust · Auto ·
  To the robot. The 3D field stays; the side panel follows the step, and each
  step shows done / needs attention with a "Next step" button. The old
  workbench is one click away as **Expert view**; saved interface choices
  still work.
- **Shot points** are one shared list: save one from the shot card, from a
  coverage-map cell, from the angle study or from an auto plan. The Field step
  lists them with distance, wheel speed, launch angle, the Monte Carlo hit rate
  and how many AprilTags the Limelight sees from there.
- The coverage map is clickable: the robot drives to the cell and its solution
  is applied. The angle study has "Use this point".
- **Chassis and drive** is a setup-wizard step. The auto planner uses this
  robot by default — size, shooter, Mecanum/Tank, turret — without asking
  again, uses the app's ball model for its shot map, offers saved points as
  shot spots, writes the launch angle into the plan text and can send a shot
  back to the simulator or the shot-point list.
- **To the robot:** a shot table from the saved points or from a distance
  sweep that keeps one launch angle for the whole table (so a value read
  between two rows is still a real solution), as CSV, an FTC Java class
  (constants + clamped linear lookup, no hardware names; compiled and run with
  a local JDK) or a printable sheet. Each export says what its numbers are
  based on.
- **Shots logged on the robot**: where, RPM, angle and what the ball did. The
  simulation replays each row and shows its own outcome next to yours. With
  exit speeds on three or more rows, the launch model is tuned on most rows and
  checked on every third.
- The calibration badge no longer goes stale when the robot is moved or the RPM
  changes: stored rows carry their own pose and the stamp covers only robot and
  ball physics. Older files are upgraded once while their stamp still matches.
- Checked: 319 software tests, type checks, lint, build, and a browser
  walkthrough at 1280 and 1440 px in Turkish and English, light and dark. Not
  checked: printing, the Java class on a robot, any number against a real
  shot.

## Update: calmer simple layout and a first-visit tour

- Start screen: two choices, "Try it now" (opens an example robot straight
  away) and "Set up my robot". ReCalc import, example robots and open-from-file
  sit below as small buttons.
- Simple layout: one tool bar (robot, Save, More, layout switch, help, theme).
  The menu bar, model tree tools, unit picker and extra shot buttons are gone
  from this layout; everything rarely used is under "More".
- Side panel: result (angle, wheel speed, exit speed, target clearance), a big
  Auto solve button, the robot card, two sliders under "Adjust by hand", and
  one closed "More settings" section for the rest.
- First visit: a five-step tour (place the robot, Auto solve, read the result,
  Fire, your own robot). Skippable, arrow keys and Esc work, shown once; reopen
  it from the "?" button or More → Quick tour.
- The advanced layout is unchanged.
- Checked in the browser at 1440, 900 and 375 px wide, Turkish and English,
  light and dark. Not checked on a real phone or with a screen reader.

## Update: comfort pass across the whole app

- Simple layout: Auto solve now puts the best setting on the robot by itself.
  The applied suggestion is marked; click another to switch.
- The toolbar no longer runs off narrow windows. Rarely used buttons fold away
  below 1180 px (they stay in the File and Edit menus); on a phone the toolbar
  is two rows.
- Phone, simple layout: a shorter 3D view and one page scroll, so the result
  card is reachable without scrolling inside a panel.
- Setup wizard: Previous / Next stay on screen on every step. On a phone the
  step strip scrolls sideways and follows the current step; the keyboard no
  longer opens by itself.
- Notices appear as a centred pill and no longer cover the Fire button.
- Advanced layout: the properties tabs scroll instead of being cut off.
- Factory robot and motor names are translated in the English interface;
  "interface" is called "layout" throughout.
- Checked in the browser at 1440, 1200, 1000, 800, 760 and 390 px wide, in
  light and dark, Turkish and English. Not checked on a real phone or with a
  screen reader.

## Update: auto planner, automatic and animated

- **No buttons to press:** pick the robot and the match; the shot map, the plan and the 2D physics check run by themselves and refresh after every change. A coarse map gives a first plan in seconds, the fine map refines it.
- **Watch it:** the robot drives the plan on the field, collects, shoots and tips the HIVE while the score counts up. Timeline with scrubbing, speeds, keyboard (Space, arrows, Home).
- **Where the time goes:** drive / pickup / shot / wait budget, and a coach that re-plans with one robot change at a time ("intake twice as fast: +5 points") with a **Try** button. Planning results, not measurements.
- **Take it with you:** copy the plan as text with times and field coordinates. Choices and shot maps are remembered in the browser.
- **Opens from the start screen** (Probot Sim builds only), works on narrow screens and in the dark theme.

## Update: auto planner (with Probot Sim)

- **Tools → Auto planner…** finds the fastest BIOBUZZ auto for a robot.
  - Drivetrain, size, route timing, field positions and scoring come from Probot Sim.
  - Shooting comes from this app's physics: a shot map for the first CELL and for the CELL after the tip.
  - Robots: Builder templates (Starter Bot, …), the open Builder project, a robot file, or manual.
  - Shooter: the Probot shooter module found on the Builder robot, or your own from this app.
- **Search:** It tries every order of the enabled pickups (pre-load, GARDEN, FLOWERs) and the tip strategies. It picks shooting spots and plans the park.
- **Result:** The plan is shown on a top-down field with a timeline and alternatives.
- **Check in physics:** The plan is driven in Probot Sim's 2D (planck) and 3D (Rapier) worlds.
  - Each drive leg is marked passed or failed, and the driven path is drawn.
  - Paths avoid the FLOWERS, and the robot enters and leaves walls straight.
  - Poses use the robot's turning point (the driven axle on a tank drive).
- **Builds:** Probot Sim is private, so its sources are synced locally (`npm run probot:sync`) and never committed. Public builds show a "not available in this build" screen instead.

## Update: Limelight / AprilTag visibility

- **Limelight on your robot:** Add a Limelight 3A (or a custom camera) in the
  Limelight section (Basit) or tab (Gelişmiş):
  - Position: forward / left / height, in mm, cm or inches.
  - Angles: pitch, yaw and roll.
  - Mount: chassis or turret.
- **Which tags, from here:** All 16 BIOBUZZ AprilTags (IDs 30–45, 36h11,
  3.25 in, under each CELL per Manual 9.9 / Figures 9-15–9-17) are drawn on
  the field. From the current pose each tag is listed as seen or with the
  reason it is not: facing away, outside the view, too small in the image,
  angle too steep, or blocked by the HIVE frame.
- **Field map:** Floor colours show how many tags are visible from each spot
  the robot can stand on. Three modes:
  - the robot's current heading;
  - the shooter turned to the HIVE;
  - any of 24 headings.

  The map is computed in a background worker.

- **Assumptions:** The 54.5° × 42° field of view is the manufacturer's figure.
  The 15 px minimum tag edge and 70° maximum viewing angle are editable guesses,
  not measured limits. Geometry only: motion blur, exposure, lighting, glare and
  other robots are not modelled. The camera is saved with the robot, outside the
  physics configuration.

## Update: TR / EN, accounts (demo)

- **Language:** Turkish and English throughout (~1150 strings). Chosen the
  Probot Studio way: `?dil=en|tr`, then `localStorage["probot-dil"]`, then the
  `probot_dil` cookie, then the browser language. An EN/TR switch sits in the
  header like on probotstudio.com; on the same origin the choice is shared.
- **Accounts (demo backend):** Sign in with email + name (no password), save
  robots to "my account", list / open / delete them, update in place with
  version checks (a stale tab cannot overwrite). Data stays in this browser
  (`probot-mock-db-v1`); one interface (`src/services/accountApi.ts`) is swapped
  for the Probot account API later.
- **Integration notes:** `docs/PROBOT_INTEGRATION_NOTES.md` for porting to
  probotstudio.com, kept up to date.

## Update: guided setup, ReCalc import, sandbox, two layouts

- **Look:** Aligned with the Probot Studio Builder: 44 px site header with the
  Probot navigation, white menubar, 36 px tool bar, dock panels with amber
  active-tab underline, warm radial canvas.
- **Full-screen start:** The first visit (and Dosya → Başlangıç ekranı) shows
  four choices: **Robotumu kur**, **ReCalc'tan aktar**, **Sandbox**, **Dosyadan
  aç**, plus saved robots.
- **Guided setup:** Six steps (mechanism, main wheel, hood / top wheel, gap and
  exit height, launch angle, summary). Each step explains what to measure and
  how; a live, to-scale side-view schematic updates as values change. The same
  flow edits an existing robot and still applies only changed fields.
- **ReCalc import:** Paste a ReCalc Flywheel "Copy Link" URL (or press
  "Panodan yapıştır"; pasting a ReCalc link anywhere in the app also opens the
  import). Shooter type, wheel diameters, target RPM, wheel ratio, wheel and
  flywheel mass / MOI and motor data are mapped and listed field by field;
  gap, exit height and hood angle are not in ReCalc and are asked for. The
  game piece is always the BIOBUZZ POLLEN; a different ReCalc projectile is
  reported, not used. ReCalc "Compound" shooters are refused with an
  explanation. The link is parsed locally and never sent anywhere.
- **Sandbox:** Three ready-made example robots, one per mechanism; unmeasured
  and not tuned to score.
- **Two layouts instead of Kolay / Orta / Zor:** **Basit arayüz** is one
  screen: field, a plain-language result card (İSABET / ISKA …), Otomatik çöz
  with one-click suggestions, and the few settings a team touches.
  **Gelişmiş arayüz** is the full workbench. Older choices map automatically
  (Kolay → Basit; Orta / Zor → Gelişmiş).
- **Wheel speed from the drive:** The setup asks how the wheel speed is set:
  motor + gear teeth + operating point (% of free speed; goBILDA 5203 1:1 /
  3.7:1 / 5.2:1, REV HD Hex or a custom free speed, nominal 12 V figures),
  a known RPM, or **decide later**. "Later" offers comparing options in the
  simple layout's _Motor ve dişli oranı_ panel (wheel RPM per motor, "yeter /
  yetmez" against the lowest Auto-solve hit, one-click apply) or opening the
  same wheel pre-filled in ReCalc (motor included only when ReCalc lists the
  same motor) and pasting the result back.
- **Units:** Every length in the setup has its own mm / cm / inç selector.
- **Clearer hood fields:** "Hood tekerlek sayısı" and "Hood tekerlek çapı".
- **Layout choice:** After a new robot is created, Basit and Gelişmiş are shown
  side by side to choose from.
- **Fix:** Solver suggestions computed for another robot or pose are no longer
  offered; previously a click could restore the earlier robot.

## Update: public-first robots (any BIOBUZZ team)

- **First visit:** A start panel offers **Robotumu kur**, **Genel örneği dene** and
  **Dosyadan aç**. Saved work and share links open directly.
- **Robotumu kur:** Pick a mechanism (main wheel + driven hood rollers, main
  wheel + fixed non-rotating hood, or two opposed wheels), then enter your
  measurements: wheel/roller diameters, RPM or ratio, gap, exit height and hood
  angles. The unmeasured model assumptions are listed. Cancel changes nothing.
  "Kurulumu düzenle" changes only the shooter, exit height and name; pose,
  POLLEN, bounce settings and calibration evidence are kept. Free-spinning
  (idler) hood rollers are not modelled.
- **General example:** Two opposed 100 mm wheels at 1400 RPM. It is nobody's
  robot, not measured and not tuned to score.
- **Provenance chip:** Robotum / Örnek · ölçülmemiş / Referans (kopya). Saving
  an example or reference copy makes it your robot and records its source.
- **Advanced examples (Zor only):** The project's reference robot, the ReCalc
  comparison model and the DECODE 2025–26 data (credited, not applicable to
  BIOBUZZ). Selecting ReCalc never shows as validated; only held-out
  measurements that re-verify do.
- **Modes:** Kolay shows wheel diameter, exit height and Auto solve. The app
  never switches mode on its own. Without a saved choice, everyone starts in Kolay.
- **Fix:** A team's own 72 mm / 16 mm shooter is no longer silently rewritten
  into this project's historical default on reload.

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
