"use client";

import { useState } from "react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, setTheme, resolved } = useTheme();
  const [open, setOpen] = useState(false);

  const label = theme === "system" ? `System (${resolved})` : theme;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="iconBtn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        title="Theme"
      >
        {resolved === "dark" ? "🌙" : "☀️"}
      </button>

      {open && (
        <div className="menu">
          <button className={`menuItem ${theme === "system" ? "active" : ""}`} onClick={() => { 
setTheme("system"); setOpen(false); }}>
            System
          </button>
          <button className={`menuItem ${theme === "light" ? "active" : ""}`} onClick={() => { 
setTheme("light"); setOpen(false); }}>
            Light
          </button>
          <button className={`menuItem ${theme === "dark" ? "active" : ""}`} onClick={() => { 
setTheme("dark"); setOpen(false); }}>
            Dark
          </button>
          <div className="menuHint">Current: {label}</div>
        </div>
      )}
    </div>
  );
}

