import type { ReactNode } from "react";
import { useStore } from "../state/store";
import { atLeast, type UiMode } from "../app/uiMode";

/** Renders its children only from `min` mode upward. Hidden inputs keep their values. */
export function ForMode({
  min,
  children,
}: {
  min: UiMode;
  children: ReactNode;
}) {
  const mode = useStore((s) => s.uiMode);
  return atLeast(mode, min) ? <>{children}</> : null;
}
