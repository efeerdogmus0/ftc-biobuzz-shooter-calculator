import { Component, type ReactNode } from "react";
import { downloadJSON } from "../utils/config";
import { activeScenarioText, clearActiveScenario } from "./recovery";

/** Last-resort boundary: recovers the active scenario without touching named profiles. */
export class AppBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message || String(e) };
  }
  exportActive = () => {
    const raw = activeScenarioText(localStorage);
    if (!raw) return;
    try {
      downloadJSON("pollen-active-recovery.json", JSON.parse(raw));
    } catch {
      downloadJSON("pollen-active-recovery.json", { raw });
    }
  };
  resetActive = () => {
    clearActiveScenario(localStorage);
    location.reload();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="scene-error" role="alert">
        <h1>POLLEN Shooter Lab stopped</h1>
        <p className="mono">{this.state.error}</p>
        <p>
          Saved named profiles are kept. Export the active scenario before
          resetting if you want to inspect or repair it.
        </p>
        <div className="actions">
          <button onClick={this.exportActive}>
            Export active scenario JSON
          </button>
          <button onClick={this.resetActive}>
            Reset active scenario and reload
          </button>
          <button onClick={() => this.setState({ error: "" })}>
            Try again
          </button>
        </div>
      </main>
    );
  }
}
