// Every dictionary is a list of [Turkish, English] pairs. One file per UI
// area so that areas can be translated independently.
import { app } from "./app";
import { controls } from "./controls";
import { analysis } from "./analysis";
import { setup } from "./setup";
import { vision } from "./vision";
import { auto } from "./auto";
import { journey } from "./journey";

export type Pair = readonly [tr: string, en: string];
export const dictionaries: readonly (readonly Pair[])[] = [
  app,
  controls,
  analysis,
  setup,
  vision,
  auto,
  journey,
];
