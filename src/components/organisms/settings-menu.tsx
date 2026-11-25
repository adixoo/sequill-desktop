import { Moon, Rows2, Rows3, Settings, Sun } from "@/components/atoms/icons";
import { Button } from "@/components/atoms/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/atoms/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";
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
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings" title="Settings">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3 p-3">
        <p className="q-label text-ink-muted">Theme</p>
        <Tabs value={theme} onValueChange={(v) => setTheme(v as ThemeName)}>
          <TabsList className="w-full" aria-label="Theme">
            <TabsTrigger value="dark">
              <Moon /> Dark
            </TabsTrigger>
            <TabsTrigger value="light">
              <Sun /> Light
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="q-label text-ink-muted">Rows</p>
        <Tabs value={density} onValueChange={(v) => setDensity(v as Density)}>
          <TabsList className="w-full" aria-label="Row density">
            <TabsTrigger value="comfortable">
              <Rows2 /> Comfortable
            </TabsTrigger>
            <TabsTrigger value="compact">
              <Rows3 /> Compact
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
