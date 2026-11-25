import type { ReactNode } from "react";
import { toast, Toaster } from "@/components/atoms/toast";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Spinner } from "@/components/atoms/spinner";
import { Loader } from "@/components/molecules/pastel/loader";
import { Input } from "@/components/atoms/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/atoms/input-group";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import { Plus, Search, Trash, X } from "@/components/atoms/icons";
import { SettingsMenu } from "@/components/organisms/settings-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/atoms/tabs";

const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const SIZES = ["xs", "sm", "default", "lg"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;
const AREAS = [
  { density: "compact", title: "Dashboard (compact)", note: "default button 30px" },
  { density: "comfortable", title: "Calm area (comfortable)", note: "default button 32px" },
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A gallery of the design system's atoms, for checking how they look in both themes. */
export function ComponentsPage() {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Components</h1>
          <SettingsMenu />
        </header>

        <Section title="Toast">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => toast("Saved query “Top customers”")}>
              Default
            </Button>
            <Button variant="outline" onClick={() => toast.success("Imported 1,204 rows")}>
              Success
            </Button>
            <Button variant="outline" onClick={() => toast.info("Changes sync on save")}>
              Info
            </Button>
            <Button variant="outline" onClick={() => toast.warning("Table has no primary key")}>
              Warning
            </Button>
            <Button variant="outline" onClick={() => toast.error("Import failed: bad CSV header")}>
              Error
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = toast.loading("Preparing CSV…");
                setTimeout(() => toast.success("Exported 1,204 rows as CSV", { id }), 1500);
              }}
            >
              Loading → success
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Row deleted", {
                  description: "1 row removed from customers",
                  action: { label: "Undo", onClick: () => toast.success("Restored") },
                })
              }
            >
              With action
            </Button>
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs defaultValue="rows">
            <TabsList>
              <TabsTrigger value="rows">Rows</TabsTrigger>
              <TabsTrigger value="structure">Structure</TabsTrigger>
              <TabsTrigger value="sql">SQL</TabsTrigger>
            </TabsList>
          </Tabs>
        </Section>

        <Section title="Spinner">
          <Row label="sizes">
            <Spinner className="size-3" />
            <Spinner />
            <Spinner className="size-6" />
            <Spinner className="size-8" />
          </Row>
          <Row label="in button">
            <Button disabled>
              <Spinner data-icon="inline-start" /> Saving
            </Button>
            <Button variant="outline" disabled>
              Loading <Spinner data-icon="inline-end" />
            </Button>
          </Row>
          <Row label="in badge">
            <Badge>
              <Spinner /> Syncing
            </Badge>
          </Row>
          <Row label="loader">
            <Loader size="sm" label="Reading the schema" />
          </Row>
        </Section>

        <Section title="Button">
          {VARIANTS.map((variant) => (
            <Row key={variant} label={variant}>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {size}
                </Button>
              ))}
              <Button variant={variant} disabled>
                disabled
              </Button>
            </Row>
          ))}
          <Row label="with icon">
            <Button>
              <Plus data-icon="inline-start" /> New table
            </Button>
            <Button variant="destructive">
              <Trash data-icon="inline-start" /> Delete
            </Button>
          </Row>
          <Row label="icon only">
            {ICON_SIZES.map((size) => (
              <Button key={size} variant="outline" size={size} aria-label={size}>
                <Plus />
              </Button>
            ))}
          </Row>
        </Section>

        <Section title="Sizes & density">
          <p className="text-sm text-ink-soft">
            Fields are always comfortable sm (32px). A default button follows its area: compact
            default (30px) on dashboards, comfortable sm (32px) in calm areas such as dialogs.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            {AREAS.map(({ density, title, note }) => (
              <div key={density} data-density={density} className="space-y-3">
                <h3 className="text-sm font-semibold text-ink">
                  {title} <span className="font-normal text-ink-muted">· {note}</span>
                </h3>
                <div className="flex items-center gap-2">
                  <Input aria-label={`${title} input`} placeholder="Field" />
                  <Button>Save</Button>
                  <Button variant="outline">Cancel</Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                    all sizes
                  </span>
                  <Button size="sm">sm</Button>
                  <Button>default</Button>
                  <Button size="lg">lg</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Input">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-default">Default</Label>
              <Input id="c-default" placeholder="customers" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-filled">Filled</Label>
              <Input id="c-filled" defaultValue="orders_2026" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-invalid">Invalid</Label>
              <Input id="c-invalid" aria-invalid defaultValue="1-bad name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-disabled">Disabled</Label>
              <Input id="c-disabled" disabled placeholder="Read only" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-file">File</Label>
              <Input id="c-file" type="file" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-search">Input group</Label>
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput id="c-search" placeholder="Search tables" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="Clear">
                    <X />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-prefix">Input group with text</Label>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>https://</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput id="c-prefix" placeholder="example.com" />
              </InputGroup>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="c-textarea">Textarea</Label>
              <Textarea id="c-textarea" placeholder="SELECT * FROM customers;" />
            </div>
          </div>
        </Section>
      </div>
      <Toaster />
    </main>
  );
}
