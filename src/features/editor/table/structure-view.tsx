import { KeyRound, Link2, ListPlus, Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { CodeBlock } from "@/shared/components/pastel/code-block";
import { Button } from "@/shared/ui/button";
import { buildDrop, buildDropColumn } from "@/shared/lib/sqlite/ddl";
import type { RelationInfo, Schema } from "@/shared/lib/sqlite/types";
import { useDialogs } from "@/shared/lib/store/dialogs";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="pn-eyebrow text-ink-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

const th = "pn-table-head border-b-2 border-hairline bg-raised px-3 py-2 text-left";
const td = "border-b border-hairline px-3 py-2 align-top";

export function StructureView({ relation, schema }: { relation: RelationInfo; schema: Schema }) {
  const open = useDialogs((s) => s.open);
  const isTable = relation.kind === "table";
  const triggers = schema.triggers.filter((t) => t.table === relation.name);
  const kindLabel = relation.kind === "view" ? "view" : "table";

  const confirmDrop = (
    kind: "table" | "view" | "index" | "trigger",
    name: string,
    description: string,
  ) =>
    open({
      kind: "confirm",
      title: `Drop ${kind} ${name}?`,
      description,
      statements: [{ sql: buildDrop(kind, name), params: [] }],
      confirmLabel: `Drop ${kind}`,
      success: `Dropped ${name}`,
      schema: true,
      destructive: true,
    });

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-2xl font-semibold tracking-[-0.015em] text-ink">
            {relation.name}
          </h2>
          {isTable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => open({ kind: "renameTable", table: relation.name })}
            >
              <Pencil /> Rename
            </Button>
          )}
          {relation.kind !== "virtual" && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                confirmDrop(
                  relation.kind === "view" ? "view" : "table",
                  relation.name,
                  relation.kind === "view"
                    ? "The view definition is removed. No table data changes."
                    : "The table, all of its rows, its indexes and triggers are removed permanently.",
                )
              }
            >
              <Trash2 /> Drop {kindLabel}
            </Button>
          )}
        </div>

        <Section
          title={`Columns · ${relation.columns.length}`}
          action={
            isTable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => open({ kind: "addColumn", table: relation.name })}
              >
                <Plus /> Add column
              </Button>
            )
          }
        >
          <div className="overflow-x-auto rounded-sm bg-surface ring-2 ring-hairline ring-inset">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Type</th>
                  <th className={th}>Constraints</th>
                  <th className={th}>Default</th>
                  {isTable && (
                    <th className={`${th} w-20`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {relation.columns.map((c) => {
                  const fk = relation.foreignKeys.find((k) => k.from === c.name);
                  return (
                    <tr key={c.name}>
                      <td className={`${td} font-medium text-ink`}>
                        <span className="flex items-center gap-1.5">
                          {c.pk > 0 && (
                            <KeyRound
                              className="size-3.5 text-butter-ink"
                              aria-label="Primary key"
                            />
                          )}
                          {c.name}
                        </span>
                      </td>
                      <td className={`${td} font-mono text-xs text-ink-soft uppercase`}>
                        {c.type || "—"}
                      </td>
                      <td className={`${td} text-ink-soft`}>
                        <span className="flex flex-wrap gap-1.5">
                          {c.pk > 0 && (
                            <span className="pn-table-head text-butter-ink">
                              pk
                              {relation.columns.filter((x) => x.pk > 0).length > 1
                                ? ` ${c.pk}`
                                : ""}
                            </span>
                          )}
                          {c.notNull && <span className="pn-table-head">not null</span>}
                          {c.hidden >= 2 && <span className="pn-table-head">generated</span>}
                          {fk && (
                            <span className="flex items-center gap-1 text-xs text-sky-ink">
                              <Link2 className="size-3" /> {fk.table}
                              {fk.to ? `.${fk.to}` : ""}
                              {fk.onDelete !== "NO ACTION" && (
                                <span className="text-ink-muted">
                                  {" "}
                                  on delete {fk.onDelete.toLowerCase()}
                                </span>
                              )}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`${td} font-mono text-xs text-ink-soft`}>
                        {c.defaultValue ?? <span className="text-ink-muted">—</span>}
                      </td>
                      {isTable && (
                        <td className={`${td} text-right`}>
                          <span className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Rename ${c.name}`}
                              onClick={() =>
                                open({ kind: "renameColumn", table: relation.name, column: c.name })
                              }
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Drop ${c.name}`}
                              onClick={() =>
                                open({
                                  kind: "confirm",
                                  title: `Drop column ${c.name}?`,
                                  description:
                                    "The column and all its values are removed. Columns used by keys, indexes or views can't be dropped.",
                                  statements: [
                                    { sql: buildDropColumn(relation.name, c.name), params: [] },
                                  ],
                                  confirmLabel: "Drop column",
                                  success: `Dropped ${c.name}`,
                                  schema: true,
                                  destructive: true,
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isTable && (
            <p className="text-xs text-ink-muted">
              {relation.withoutRowid
                ? "WITHOUT ROWID"
                : `rowid as "${relation.rowidName ?? "none"}"`}
              {relation.strict && " · STRICT"}
            </p>
          )}
        </Section>

        {isTable && (
          <Section
            title={`Indexes · ${relation.indexes.length}`}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => open({ kind: "createIndex", table: relation.name })}
              >
                <ListPlus /> Create index
              </Button>
            }
          >
            {relation.indexes.length === 0 ? (
              <p className="text-sm text-ink-muted">
                No indexes. Add one on columns you filter or sort by often.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline rounded-sm bg-surface ring-2 ring-hairline ring-inset">
                {relation.indexes.map((ix) => (
                  <li key={ix.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{ix.name}</span>
                    <span className="font-mono text-xs text-ink-soft">
                      ({ix.columns.join(", ")})
                    </span>
                    {ix.unique && <span className="pn-table-head">unique</span>}
                    {ix.partial && <span className="pn-table-head">partial</span>}
                    {ix.origin !== "c" && (
                      <span className="pn-table-head">
                        {ix.origin === "pk" ? "primary key" : "constraint"}
                      </span>
                    )}
                    {ix.origin === "c" && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="ml-auto"
                        aria-label={`Drop index ${ix.name}`}
                        onClick={() =>
                          confirmDrop(
                            "index",
                            ix.name,
                            "Queries that relied on this index may get slower. No data is lost.",
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        {triggers.length > 0 && (
          <Section title={`Triggers · ${triggers.length}`}>
            <ul className="flex flex-col gap-3">
              {triggers.map((t) => (
                <li key={t.name} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">{t.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Drop trigger ${t.name}`}
                      onClick={() =>
                        confirmDrop(
                          "trigger",
                          t.name,
                          "The trigger stops running. No data is lost.",
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  {t.sql && <CodeBlock fileName={`${t.name}.sql`} code={t.sql} />}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {relation.sql && (
          <Section title="Definition">
            <CodeBlock fileName={`${relation.name}.sql`} code={relation.sql} />
          </Section>
        )}
      </div>
    </div>
  );
}
