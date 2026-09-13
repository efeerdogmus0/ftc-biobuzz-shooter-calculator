# Unit conventions

| Quantity           | Internal / exported JSON | FTC display |
| ------------------ | ------------------------ | ----------- |
| Position, geometry | m                        | m / mm      |
| Mass               | kg                       | g           |
| Angle              | rad                      | degrees     |
| Angular speed      | rad/s                    | RPM         |
| Linear speed       | m/s                      | m/s         |
| Force              | N                        | N           |
| Energy             | J                        | J           |
| Inertia            | kg m²                    | kg m²       |
| Temperature        | K                        | K           |
| Pressure           | Pa                       | Pa          |

Conversions occur at UI/input boundaries. 1 in = 0.0254 m exactly. 1 lb = 0.45359237 kg. 1 in² lb = 0.0002926396534292 kg m². `omega = RPM * 2*pi/60`; `angle = degrees*pi/180`.

Global SI mode switches editable geometry, mass, speed and angle controls to SI. Engineering metrics and plots retain explicit fixed units (RPM, degrees, m/s) for quick comparison. Calibration measurements deliberately use named `primaryRPM`, `secondaryRPM`, `hoodDeg`, `spinRPM` API boundary fields; all flight positions and times remain SI. Uncertainty input labels explicitly specify their units.

Z-up world coordinates are used by physics and the 3D scene with no length scaling. Robot center/offset transforms are in meters. Imported GLB must also be in meters and Z-up; visual CAD does not define collisions automatically.
