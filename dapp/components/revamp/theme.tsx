"use client";

import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { radii, spacing, themeTokens, type RevampTheme } from "./tokens";
import styles from "./revamp.module.css";

const STORAGE_KEY = "ckboost-revamp-theme";
const ThemeContext = createContext<{
  theme: RevampTheme;
  toggleTheme: () => void;
  portalContainer: HTMLDivElement | null;
} | null>(null);

/** Local theme only: never sets html classes or next-themes' legacy preference. */
export function RevampThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<RevampTheme>("dark");
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch { /* Storage may be unavailable; the default remains usable. */ }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Optional persistence. */ }
  }

  const variables = Object.fromEntries([
    ...Object.entries(themeTokens[theme]).map(([name, value]) => [`--ckb-${name}`, value]),
    ...spacing.map(value => [`--ckb-space-${value}`, `${value}px`]),
    ...radii.map(value => [`--ckb-radius-${value}`, `${value}px`]),
    ["colorScheme", theme],
  ]) as CSSProperties;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, portalContainer }}>
      <div className={styles.root} data-ckboost-revamp data-theme={theme} style={variables}>
        {children}
        <div ref={setPortalContainer} />
      </div>
    </ThemeContext.Provider>
  );
}

export function useRevampTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Revamp components need RevampThemeProvider");
  return context;
}
