import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Circle,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  Layers,
  Settings2,
  Spline,
  Target,
} from "lucide-react";
import { useStore, type CameraView } from "../state/store";
import type { Shot } from "../physics/types";
import { norm } from "../physics/math";

export interface MenuCommand {
  label: string;
  run: () => void;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
}
export function WorkbenchMenu({
  menus,
}: {
  menus: { label: string; items: MenuCommand[] }[];
}) {
  const [active, setActive] = useState<string | null>(null),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setActive(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div className="workbench-menu" ref={ref}>
      {menus.map((menu) => (
        <div className="menu-root" key={menu.label}>
          <button
            aria-haspopup="menu"
            aria-expanded={active === menu.label}
            onClick={() => setActive(active === menu.label ? null : menu.label)}
          >
            {menu.label}
          </button>
          {active === menu.label && (
            <div
              className="menu-popup"
              role="menu"
              aria-label={`${menu.label} menu`}
            >
              {menu.items.map((item) => (
                <button
                  key={item.label}
                  role={
                    item.checked === undefined ? "menuitem" : "menuitemcheckbox"
                  }
                  aria-checked={item.checked}
                  disabled={item.disabled}
                  onClick={() => {
                    item.run();
                    setActive(null);
                  }}
                >
                  <span className="menu-check" aria-hidden="true">
                    {item.checked ? "✓" : ""}
                  </span>
                  <span>{item.label}</span>
                  <kbd>{item.shortcut}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Branch({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <details className="tree-branch" open>
      <summary>
        <ChevronRight className="tree-chevron" size={12} />
        {icon}
        <span>{title}</span>
      </summary>
      <div className="tree-children">{children}</div>
    </details>
  );
}

export function ModelTree({
  shot,
  tab,
  select,
  view,
  bottom,
}: {
  shot: Shot;
  tab: string;
  select: (tab: string) => void;
  view: (view: CameraView) => void;
  bottom: (tab: string) => void;
}) {
  const s = useStore();
  const leaf = (
    name: string,
    icon: ReactNode,
    onClick: () => void,
    selected = false,
    visible?: boolean,
    toggle?: () => void,
  ) => (
    <div className={`tree-leaf ${selected ? "selected" : ""}`} key={name}>
      <button
        className="tree-select"
        onClick={onClick}
        aria-current={selected ? "true" : undefined}
      >
        {icon}
        <span>{name}</span>
      </button>
      {toggle && (
        <button
          className="tree-visibility"
          title={`${visible ? "Hide" : "Show"} ${name}`}
          aria-label={`${visible ? "Hide" : "Show"} ${name}`}
          onClick={toggle}
        >
          {visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      )}
    </div>
  );
  return (
    <section className="model-tree dock-panel" aria-label="Model explorer">
      <div className="panel-title">
        <span>Model</span>
        <Layers size={13} />
      </div>
      <div className="tree-scroll">
        <Branch
          title="Project"
          icon={<FolderOpen size={15} className="blue-icon" />}
        >
          <Branch title="BIOBUZZ 2026–27" icon={<Folder size={15} />}>
            <Branch title="Field" icon={<Box size={15} />}>
              {leaf(
                "Field geometry",
                <Box size={14} />,
                () => select("Field"),
                tab === "Field",
                s.overlays.field,
                () =>
                  s.set({
                    overlays: { ...s.overlays, field: !s.overlays.field },
                  }),
              )}
              {leaf("Field posts (4)", <Layers size={14} />, () => {
                select("Field");
                view("Orbit");
              })}
              {leaf("Floor", <Layers size={14} />, () => view("Top"))}
            </Branch>
            <Branch title="Robot" icon={<Box size={15} />}>
              {leaf("Drive base", <Settings2 size={14} />, () => {
                select("Shooter");
                view("Shooter");
              })}
              {leaf(
                "Shooter",
                <Box size={15} className="blue-icon" />,
                () => select("Shooter"),
                tab === "Shooter",
              )}
              <div className="tree-detail">
                <Settings2 size={12} />
                <span title={shot.config.name}>{shot.config.name}</span>
              </div>
            </Branch>
            <Branch title="HIVE" icon={<Target size={15} />}>
              {leaf(
                "Red CELLS (2)",
                <Target size={14} className="red-icon" />,
                () => {
                  select("Field");
                  view("HIVE");
                },
              )}
              {leaf(
                "Blue CELLS (2)",
                <Target size={14} className="blue-icon" />,
                () => {
                  select("Field");
                  view("HIVE");
                },
              )}
              {leaf(
                `Resident balls (${s.residentCount})`,
                <Circle size={13} />,
                () => select("Sekiş"),
                tab === "Sekiş",
              )}
            </Branch>
            <Branch
              title="Trajectory"
              icon={<Spline size={15} className="orange-icon" />}
            >
              {leaf(
                "Simulated shot",
                <Circle size={11} className="orange-icon" />,
                () => bottom("Shot metrics"),
                false,
                s.showTrajectory,
                () => s.set({ showTrajectory: !s.showTrajectory }),
              )}
              {leaf(
                `Apex (${shot.flight.apex.p[2].toFixed(2)} m)`,
                <Circle size={10} />,
                () => {
                  bottom("Flight telemetry");
                  s.set({
                    playing: false,
                    seekTime: shot.flight.apex.t,
                    seekTick: s.seekTick + 1,
                  });
                },
              )}
            </Branch>
          </Branch>
        </Branch>
      </div>
      <div className="tree-caption">
        <Crosshair size={12} />
        <span>XY ground plane · Z up</span>
      </div>
    </section>
  );
}

export function TrajectoryTable({ shot }: { shot: Shot }) {
  const samples = shot.flight.samples,
    stride = Math.max(1, Math.floor((samples.length - 1) / 8)),
    rows = samples.filter(
      (_, i) => i % stride === 0 || i === samples.length - 1,
    );
  return (
    <div className="trajectory-data">
      <div className="data-caption">
        Trajectory data <span>(ground relative)</span>
      </div>
      <div className="trajectory-data-scroll">
        <table>
          <thead>
            <tr>
              <th>Range (m)</th>
              <th>Height (m)</th>
              <th>Time (s)</th>
              <th>Speed (m/s)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.t}>
                <td>
                  {Math.hypot(
                    p.p[0] - shot.origin[0],
                    p.p[1] - shot.origin[1],
                  ).toFixed(2)}
                </td>
                <td>{p.p[2].toFixed(3)}</td>
                <td>{p.t.toFixed(3)}</td>
                <td>{norm(p.v).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PanelTitle({
  children,
  close,
  label,
}: {
  children: ReactNode;
  close?: () => void;
  label?: string;
}) {
  return (
    <div className="panel-title">
      <span>{children}</span>
      {close && (
        <button title={label} aria-label={label} onClick={close}>
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
}
