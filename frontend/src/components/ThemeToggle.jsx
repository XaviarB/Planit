import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "planit:theme";

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);
  return [theme, setTheme];
}

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      className={`w-10 h-10 rounded-full border-2 grid place-items-center transition hover:scale-105 ${className}`}
      style={{
        borderColor: "var(--ink)",
        background: theme === "dark" ? "var(--pastel-lavender)" : "var(--pastel-yellow)",
        color: "var(--ink)",
      }}
      aria-label={`Switch to ${next} mode`}
      data-testid="theme-toggle-btn"
      title={`Switch to ${next} mode`}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
