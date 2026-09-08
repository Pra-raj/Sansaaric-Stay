"use client";

import { useTheme } from "@/lib/theme-context";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={
        theme === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-bg hover:text-ink"
    >
      {theme === "light" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={0.8}
          className="h-5 w-5"
        >
          <path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="h-5 w-5"
        >
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}
