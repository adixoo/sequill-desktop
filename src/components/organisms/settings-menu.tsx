import { Hint } from "@/components/atoms/tooltip";
import { Moon, Rows2, Rows3, Settings, Sun } from "@/components/atoms/icons";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { PillGroup, PillGroupItem } from "@/components/atoms/pill-group";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/store/workspace";
import type { ThemeName } from "@/types/lib/theme";
import type { Density } from "@/types/store/workspace";

/** The app's settings in a popover: theme and row density. */
export function SettingsMenu() {
  const { theme, setTheme } = useTheme();
  const density = useWorkspace((s) => s.density);
  const setDensity = useWorkspace((s) => s.setDensity);
  return (
    <Popover>
      <Hint label="Settings">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3 p-3">
        <p className="q-label text-ink-muted">Theme</p>
        <PillGroup
          value={theme}
          onValueChange={(v) => setTheme(v as ThemeName)}
          aria-label="Theme"
          className="w-full"
        >
          <PillGroupItem value="dark">
            <Moon /> Dark
          </PillGroupItem>
          <PillGroupItem value="light">
            <Sun /> Light
          </PillGroupItem>
        </PillGroup>
        <p className="q-label text-ink-muted">Rows</p>
        <PillGroup
          value={density}
          onValueChange={(v) => setDensity(v as Density)}
          aria-label="Row density"
          className="w-full"
        >
          <PillGroupItem value="comfortable">
            <Rows2 /> Comfortable
          </PillGroupItem>
          <PillGroupItem value="compact">
            <Rows3 /> Compact
          </PillGroupItem>
        </PillGroup>
      </PopoverContent>
    </Popover>
  );
}
