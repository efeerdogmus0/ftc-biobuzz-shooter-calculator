import { createRoot } from "react-dom/client";
import App from "./app/App";
import { AppBoundary } from "./app/AppBoundary";
import "./app/styles.css";
createRoot(document.getElementById("root")!).render(
  <AppBoundary>
    <App />
  </AppBoundary>,
);
