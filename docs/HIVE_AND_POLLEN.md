# Moving HIVE and perforated POLLEN

The bounce laboratory uses a reduced rigid-body/contact model. Neither
numerical tests nor the default tuning establish physical accuracy on an
unmeasured field.

## Source geometry and the 7/8 reference

The [FIRST Event Field Setup Guide, sections 12.2–12.3](https://ftc-resources.firstinspires.org/ftc/field/eventfieldguide)
requires no tip when a seventh POLLEN is tossed into six, and a tip when an
eighth is tossed into seven. Gentle placement of the eighth tipping is a
preferred calibration result. Pieces are placed at the back skin, and each
CELL is calibrated separately with ballast washers. The model currently
represents POLLEN-only loads; the separate NECTAR calibration cases are not
implemented.

The [ARENA drawings, figures 9-9–9-11](https://ftc-resources.firstinspires.org/ftc/game/manual-09)
provide the shared pivot height, overall span, cell dimensions and deployed
30 degree attitude. The nominal opening-center Y offset has been corrected
from the old static fixture using the 42.91 in span and the 59.55 in opening
midpoint. The opposite CELL is obtained by mirroring the leveled assembly,
then applying the deployed angle. Both cells therefore undergo one rigid
hinge transform. This remains a dimensional proxy, not imported full frame CAD.

## Hinge/contact coupling

The blue HIVE has one rotational coordinate q with stops at 0 and 60 degrees,
displayed as assembly angles -30 to +30 degrees. Each contact uses the wall
velocity `omega_hinge cross (contact - pivot)`. Its opposite impulse updates
hinge angular momentum, with direction-dependent inverse contact mass:

```
inverse mass(d) = 1/m + (arm cross d)^T I_world^-1 (arm cross d)
               + [axis dot ((contact - pivot) cross d)]² / I_hinge
```

Ball pairs include both bodies instead of the hinge term. Normal impulses may
change ball spin when the support arm is not radial. Friction impulses update
translation, spin and the hinge reaction consistently.

The unloaded assembly's bi-stability is approximated by:

```
U_hinge(q) = C cos(q - travel/2)
tau_hinge(q) = C sin(q - travel/2)
```

C is chosen so the holding torque at the initial stop matches an adjustable
POLLEN-equivalent back-skin load, default 7.5 balls. It is a calibration
parameter between the seven/eight references, not an official fractional-ball
rule. There is no ball-count condition that triggers motion: contact force,
moment arm, impulse, opposing reaction and initial motion determine it.

The reference ball is separate from the projectile under test: initially 25 g
and 71.12 mm. `hiveReferenceMass` and `hiveReferenceDiameter` set this calibration
reference. Varying projectile weight or diameter leaves the holding torque
unchanged on the same field. The explicit **Seçili topu denge referansı yap**
action recalibrates against the current ball. Changing the threshold/reference
changes the HIVE setup; loading a different ball does not.

The 0.12 kg m² inertia, 0.08 N m s/rad angular damping, end-stop restitution
and balanced gravity potential are unmeasured effective defaults. Angular
viscous damping and a dissipative stop are a proxy for bearings and the actual
linear dampers; their force/stroke curve is not identified. The other alliance
HIVE stays fixed.

All four rendered CELLS remain collision solids. The blue pair transfers
contact impulse to its shared hinge when enabled; red CELLS stay fixed and
receive no blue-hinge reaction. Disabling motion fixes the blue pair at the
selected initial angle without removing either CELL; its constant pose track
also drives drawing and occupancy. Static flight and analysis use the published
initial solids as their fixed reference.

Frame beams, base rails, feet and finite cylindrical pivot hubs share their
geometry with the renderer and both collision engines. The blue arms/hub follow
the same hinge transform and react to ball impacts. Fixed supports and the red
assembly do not react on the blue hinge. These member dimensions are visual
proxies and still need CAD/measurement validation. The robot-only footprint
affects legal robot positions but is not a ball obstacle. Isolated target
experiments may disable the support frame with `field.hiveStructure=false`.

Residents settle with the HIVE held at its selected initial attitude; the
hinge is released at shot time when motion is enabled. Their residual velocities are retained if
settling times out. Both CELLS, all ball tracks, hinge angle/speed and tip
markers use the same simulation clock. A recorded tip is arrival within
0.001 rad of the opposite stop; it is not referee scoring certification.

## POLLEN geometry and rotation

The [AndyMark scoring-element page](https://andymark.com/products/biobuzz-scoring-elements)
provides the [POLLEN drawing](https://s3.amazonaws.com/docusync-files/bc64addc5b9b6e528cb96de4e498ffd2134eb656232d4f0e3c7f5c1ebd057b58/am-5851_yellow%20Pollen.pdf)
and [STEP model](https://s3.amazonaws.com/docusync-files/3876dea7b683c2085286da2899504555aab1a13720ab8c02c1d0107e1095f445/am-5851_yellow%20Pollen.STEP).
The CAD contains 26 radial hole axes, 1.4 in outer radius, 1.33 in inner
radius, and 0.22 in hole-cylinder radius. The drawing rounds hole diameter
to 0.4 in and states that hemisphere clocking is not required. The extracted
axes are in `pollenGeometry.ts`; body Y is the hemisphere axis.

The model scales this shell to configured diameter and mass. Adjustable
ellipsoidal axes are (1+e, 1-e, 1), with e=1% an explicit unmeasured starting
variation. One hemisphere's holes can rotate independently around Y.

Contact uses analytic support points of this perforated ellipsoidal envelope.
If an outer support lies in a missing cap, support moves to the hole rim.
Exactly centered holes use three equally spaced rim contacts to avoid an
arbitrary preferred torque direction. Pair contacts use a center-line support
proxy. This does not resolve shell interlocking, small edges penetrating into
the cavity, local buckling, cracks or exact concave mesh collisions.

Deterministic volume quadrature (4096 angular directions, three radial
midpoints) supplies the finite-thickness perforated shell's diagonal body
inertia. Its world tensor rotates with the quaternion. Angular impulses use
this tensor, and free orientation updates preserve world angular momentum.
Solid-sphere, thin-shell or explicit profile inertia remain selectable; an
explicit profile scalar takes precedence over the computed shell inertia.

Ellipsoid projected area follows orientation in both static flight and the
contact world, using the same force evaluator. Drag, Magnus and spin decay
still use user-supplied empirical coefficients. The perforation's pressure
field and flow through holes are not solved, and no random force is injected
to imitate them. Exit spin is derived from shooter wheel/hood contact, with
non-rotating feed. The selected ball inertia is projected onto the shooter's
transverse axis for that contact calculation; the same body tensor then drives
free rotation and impacts. No manual exit-spin override is applied. The legacy
profile feed-spin field is retained for import compatibility but is ignored.
ReCalc mode retains its empirical surface-speed difference formula.

Residents remain independent bodies during tipping, falling and floor bounces.
The HIVE camera frames the mechanism and floor, and the discharge replay starts
before the end-stop event rather than pausing on it. Live occupancy compares
ball positions with both CELL poses at the current playback time, while floor
arrival counts come from each ball's recorded contact events.

## Diagnostics and limits

Energy includes HIVE rotational and gravity-potential terms plus damping and
stop losses. Contact work includes hinge kinetic-energy changes; the elastic
model independently integrates normal dissipation. Gyroscopic updates,
support changes, positional projection and finite steps can introduce
residual error; compare smaller steps for quantitative use.

The original HIT/MISS and Auto solve remain the static empty-CELL reference.
Loaded, moving-HIVE outcomes must be read from the bounce tracks and final
occupancy. Run the seven/eight loading tests and measure angle versus time,
rebound velocity/spin, and damper behavior before adopting competition margins.
