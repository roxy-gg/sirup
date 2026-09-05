import { createContext, useContext, useCallback, useEffect, useState } from "react";

const ThemeContext = createContext(null);
const STORAGE_KEY = "sirup-theme";

/**
 * HOOKS -- owns theme state and persistence.
 *
 * The initial value is read synchronously from the DOM class that index.html
 * sets before first paint, so React never disagrees with what's on screen.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  const setTheme = useCallback((next) => {
    const root = document.documentElement;

    // Only animate colour on an explicit switch -- not on load, and not on
    // every unrelated class change.
    root.classList.add("theme-switching");
    root.classList.toggle("dark", next === "dark");
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);

    window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
  }, [setTheme]);

  // Follow the OS only while the user hasn't made an explicit choice.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      document.documentElement.classList.toggle("dark", event.matches);
      setThemeState(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return context;
}
