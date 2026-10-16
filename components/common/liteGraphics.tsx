"use client";

import { useEffect } from "react";

/** Weak phones (≤ 4 GB memory or ≤ 4 cores) get "lite graphics" on every screen. */
export function LiteGraphics() {
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
    const fewCores = typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    document.documentElement.classList.toggle("lite-gfx", lowMemory || fewCores);
  }, []);
  return null;
}