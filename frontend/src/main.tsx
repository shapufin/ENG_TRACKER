import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryProvider } from "@/context/QueryContext";
import { ThemeProvider } from "@/context/ThemeContext";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </QueryProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Register service worker for PWA + offline support (production only to avoid
// stale offline caching during local development). In dev, actively unregister
// any pre-existing worker so the latest source is served.
if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((r) => r.unregister()))
      .catch((err) => console.warn("Service worker unregister failed:", err));
  } else if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          const announceWaitingWorker = () => {
            if (registration.waiting) {
              window.dispatchEvent(
                new CustomEvent("service-worker-update", { detail: registration })
              );
            }
          };

          announceWaitingWorker();
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            installing?.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                announceWaitingWorker();
              }
            });
          });
        })
        .catch((err) => {
          console.warn("Service worker registration failed:", err);
        });
    });
  }
}
