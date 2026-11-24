import { siDuckdb, siMysql, siPostgresql, siSqlite, type SimpleIcon } from "simple-icons";
import { Database } from "@/components/atoms/icons";
import { cn } from "@/utils";

// SQL Server has no mark in simple-icons (Microsoft had it removed), so it gets the generic one.
const MARKS: Record<string, SimpleIcon> = {
  postgresql: siPostgresql,
  mysql: siMysql,
  duckdb: siDuckdb,
  sqlite: siSqlite,
};

/** A database's logo in one colour (the text colour), or a generic database icon. */
export function DialectIcon({ dialect, className }: { dialect: string; className?: string }) {
  const mark = MARKS[dialect];
  if (!mark) return <Database aria-hidden className={cn("size-5", className)} />;
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 fill-current", className)}>
      <path d={mark.path} />
    </svg>
  );
}
