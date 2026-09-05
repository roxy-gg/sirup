import { Button } from "@/components/ui/button";
import { ThemeMorphIcon } from "./ThemeMorphIcon";
import { useTheme } from "../hooks/useTheme";

/**
 * COMPONENT -- the toggle button. Reads state from the hook layer and renders
 * the morph; it holds no state of its own.
 */
export function ThemeToggle({ className }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <ThemeMorphIcon isDark={isDark} />
    </Button>
  );
}
