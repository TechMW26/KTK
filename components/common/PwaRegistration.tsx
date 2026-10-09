"use client";

import { useEffect } from "react";

/** Updates wait for the next launch, rather than reloading an active match. */
export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) { document.documentElement.dataset.pwaReady = "unavailable"; return; }
    document.documentElement.dataset.pwaReady = "registering";
    let stopped = false;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(registration => {
      if (!stopped) document.documentElement.dataset.pwaReady = registration.active ? "active" : "registered";
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (!stopped && worker.state === "activated") document.documentElement.dataset.pwaReady = "active";
      });
    }).catch((error: unknown) => {
      if (!stopped) {
        document.documentElement.dataset.pwaReady = "failed";
        document.documentElement.dataset.pwaError = error instanceof Error ? error.message : "unknown";
      }
    });
    return () => { stopped = true; };
  }, []);
  return null;
}
