// Initialize Sentry before anything else
import "./lib/sentry";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload once when a new service worker takes control (post-deploy freshness).
if ("serviceWorker" in navigator) {
  let hasReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
