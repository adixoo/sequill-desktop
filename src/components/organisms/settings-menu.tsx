import { Hint } from "@/components/atoms/tooltip";
import { Moon, Rows2, Rows3, Settings, Sun } from "@/components/atoms/icons";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/atoms/toggle-group";
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
        {/* Segmented controls, not tabs: they set a value and show no panel. Radix clears the
            value when the pressed item is clicked again, so empty values are ignored. */}
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={theme}
          onValueChange={(v) => v && setTheme(v as ThemeName)}
          aria-label="Theme"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="dark">
            <Moon /> Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="light">
            <Sun /> Light
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="q-label text-ink-muted">Rows</p>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={density}
          onValueChange={(v) => v && setDensity(v as Density)}
          aria-label="Row density"
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="comfortable">
            <Rows2 /> Comfortable
          </ToggleGroupItem>
          <ToggleGroupItem value="compact">
            <Rows3 /> Compact
          </ToggleGroupItem>
        </ToggleGroup>
      </PopoverContent>
    </Popover>
  );
}
