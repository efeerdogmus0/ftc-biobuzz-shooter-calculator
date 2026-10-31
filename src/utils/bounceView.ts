import type { BounceEvent, Sample } from "../physics/types";
export const bouncePalette = [
  "#e89512",
  "#248c82",
  "#367ac5",
  "#9165b5",
  "#bf637f",
  "#718f3d",
];
export const surfaceNames: Record<string, string> = {
  Floor: "Zemin",
  Ball: "Top–top",
  "CELL bottom": "CELL tabanı",
  "CELL front rim": "CELL alt kenarı",
  "CELL left rim": "CELL sol duvarı",
  "CELL right rim": "CELL sağ duvarı",
  "CELL roof left": "CELL sol eğimli kenarı",
  "CELL roof right": "CELL sağ eğimli kenarı",
  "Opposite CELL bottom": "Karşı CELL tabanı",
  "Opposite CELL front rim": "Karşı CELL alt kenarı",
  "Opposite CELL left rim": "Karşı CELL sol duvarı",
  "Opposite CELL right rim": "Karşı CELL sağ duvarı",
  "Opposite CELL roof left": "Karşı CELL sol eğimli kenarı",
  "Opposite CELL roof right": "Karşı CELL sağ eğimli kenarı",
  "West wall": "Batı duvarı",
  "East wall": "Doğu duvarı",
  "North wall": "Kuzey duvarı",
  "South wall": "Güney duvarı",
};
for (const [prefix, label] of [
  ["Red upward ", "Kırmızı üst"],
  ["Red lower ", "Kırmızı alt"],
])
  for (const [surface, name] of Object.entries({ ...surfaceNames }))
    if (surface.startsWith("CELL"))
      surfaceNames[prefix + surface] = `${label} ${name}`;
export function trajectorySegments(samples: Sample[], events: BounceEvent[]) {
  const segments: { samples: Sample[]; color: string; index: number }[] = [];
  let start = 0,
    first = samples[0];
  for (let i = 0; i <= events.length; i++) {
    const event = events[i];
    const points = [first];
    while (start < samples.length && (!event || samples[start].t < event.t)) {
      if (samples[start].t > first.t) points.push(samples[start]);
      start++;
    }
    if (event) points.push(event);
    if (points.length > 1)
      segments.push({
        samples: points,
        color: bouncePalette[i % bouncePalette.length],
        index: i,
      });
    if (event)
      first = {
        ...event,
        v: event.outgoing,
        spin: event.outgoingSpin ?? event.spin,
      };
  }
  return segments;
}
