import { Moon, Sun } from "@/components/atoms/icons";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/atoms/button";

const NEXT = { dark: "light", light: "dark" } as const;
const ICONS = { dark: Moon, light: Sun } as const;

/** One button that switches between dark and light. No menu, so it adds almost nothing to the bundle. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}`}
      title={`Theme: ${theme}`}
      onClick={() => setTheme(NEXT[theme])}
    >
      <Icon />
    </Button>
  );
}
