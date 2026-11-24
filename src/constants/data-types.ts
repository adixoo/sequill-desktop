import type { TypeKind } from "@/utils/data/format";

/** A column type a database offers, as the type picker lists it. */
export interface DataType {
  /** The spelling the picker writes into the column. */
  name: string;
  kind: TypeKind;
  /** What it holds, in a few words. */
  description: string;
  /** Other spellings of the same type, as schemas and dumps write them. */
  aliases?: readonly string[];
}

/** Common data types of each database, keyed by dialect (see `IMPORT_DIALECTS`). */
export const DATA_TYPES: Record<string, readonly DataType[]> = {
  sqlite: [
    {
      name: "INTEGER",
      kind: "number",
      description: "Whole number, up to 8 bytes",
      aliases: ["INT"],
    },
    { name: "REAL", kind: "number", description: "8-byte floating-point number" },
    { name: "NUMERIC", kind: "number", description: "Number, kept exact when it can be" },
    { name: "TEXT", kind: "text", description: "Text of any length" },
    { name: "BLOB", kind: "binary", description: "Bytes, stored as given" },
    { name: "ANY", kind: "other", description: "Any value, unconverted (STRICT tables)" },
  ],
  postgresql: [
    { name: "smallint", kind: "number", description: "2-byte integer", aliases: ["int2"] },
    {
      name: "integer",
      kind: "number",
      description: "4-byte integer",
      aliases: ["int", "int4"],
    },
    { name: "bigint", kind: "number", description: "8-byte integer", aliases: ["int8"] },
    {
      name: "serial",
      kind: "number",
      description: "Auto-incrementing 4-byte integer",
      aliases: ["serial4"],
    },
    {
      name: "bigserial",
      kind: "number",
      description: "Auto-incrementing 8-byte integer",
      aliases: ["serial8"],
    },
    {
      name: "numeric(10,2)",
      kind: "number",
      description: "Exact number of chosen precision",
      aliases: ["numeric", "decimal"],
    },
    { name: "real", kind: "number", description: "4-byte floating point", aliases: ["float4"] },
    {
      name: "double precision",
      kind: "number",
      description: "8-byte floating point",
      aliases: ["float8", "float"],
    },
    { name: "boolean", kind: "boolean", description: "True or false", aliases: ["bool"] },
    { name: "text", kind: "text", description: "Text of any length" },
    {
      name: "varchar(255)",
      kind: "text",
      description: "Text up to a length",
      aliases: ["varchar", "character varying"],
    },
    {
      name: "char(1)",
      kind: "text",
      description: "Fixed-length text",
      aliases: ["char", "character", "bpchar"],
    },
    { name: "uuid", kind: "uuid", description: "Universally unique identifier" },
    { name: "date", kind: "date", description: "Calendar date" },
    {
      name: "time",
      kind: "time",
      description: "Time of day",
      aliases: ["time without time zone"],
    },
    {
      name: "timestamp",
      kind: "date",
      description: "Date and time",
      aliases: ["timestamp without time zone"],
    },
    {
      name: "timestamptz",
      kind: "date",
      description: "Date and time with time zone",
      aliases: ["timestamp with time zone"],
    },
    { name: "interval", kind: "time", description: "Span of time" },
    { name: "json", kind: "json", description: "JSON, stored as text" },
    { name: "jsonb", kind: "json", description: "JSON, stored parsed and indexable" },
    { name: "bytea", kind: "binary", description: "Bytes" },
    { name: "inet", kind: "network", description: "IP address" },
    {
      name: "integer[]",
      kind: "array",
      description: "Array of integers",
      aliases: ["int[]", "int4[]", "_int4"],
    },
    { name: "text[]", kind: "array", description: "Array of text", aliases: ["_text"] },
  ],
  mysql: [
    { name: "INT", kind: "number", description: "4-byte integer", aliases: ["INTEGER"] },
    { name: "BIGINT", kind: "number", description: "8-byte integer" },
    { name: "SMALLINT", kind: "number", description: "2-byte integer" },
    {
      name: "TINYINT(1)",
      kind: "boolean",
      description: "True or false",
      aliases: ["BOOLEAN", "BOOL"],
    },
    {
      name: "DECIMAL(10,2)",
      kind: "number",
      description: "Exact number of chosen precision",
      aliases: ["DECIMAL", "NUMERIC"],
    },
    { name: "FLOAT", kind: "number", description: "4-byte floating point" },
    { name: "DOUBLE", kind: "number", description: "8-byte floating point" },
    {
      name: "VARCHAR(255)",
      kind: "text",
      description: "Text up to a length",
      aliases: ["VARCHAR"],
    },
    { name: "CHAR(1)", kind: "text", description: "Fixed-length text", aliases: ["CHAR"] },
    { name: "TEXT", kind: "text", description: "Text up to 64 KB" },
    { name: "LONGTEXT", kind: "text", description: "Text up to 4 GB" },
    { name: "DATE", kind: "date", description: "Calendar date" },
    { name: "DATETIME", kind: "date", description: "Date and time" },
    { name: "TIMESTAMP", kind: "date", description: "Date and time, stored in UTC" },
    { name: "TIME", kind: "time", description: "Time of day or span" },
    { name: "JSON", kind: "json", description: "JSON document" },
    { name: "BLOB", kind: "binary", description: "Bytes, up to 64 KB" },
    {
      name: "ENUM('a','b')",
      kind: "text",
      description: "One value from a list",
      aliases: ["ENUM"],
    },
    { name: "SET('a','b')", kind: "text", description: "Any values from a list", aliases: ["SET"] },
  ],
  mssql: [
    { name: "INT", kind: "number", description: "4-byte integer", aliases: ["INTEGER"] },
    { name: "BIGINT", kind: "number", description: "8-byte integer" },
    { name: "SMALLINT", kind: "number", description: "2-byte integer" },
    { name: "TINYINT", kind: "number", description: "1-byte integer, 0 to 255" },
    { name: "BIT", kind: "boolean", description: "1, 0 or NULL" },
    {
      name: "DECIMAL(10,2)",
      kind: "number",
      description: "Exact number of chosen precision",
      aliases: ["DECIMAL", "NUMERIC"],
    },
    { name: "MONEY", kind: "number", description: "Currency amount" },
    { name: "FLOAT", kind: "number", description: "8-byte floating point" },
    {
      name: "NVARCHAR(255)",
      kind: "text",
      description: "Unicode text up to a length",
      aliases: ["NVARCHAR"],
    },
    { name: "NVARCHAR(MAX)", kind: "text", description: "Unicode text up to 2 GB" },
    {
      name: "VARCHAR(255)",
      kind: "text",
      description: "Text up to a length",
      aliases: ["VARCHAR"],
    },
    { name: "CHAR(1)", kind: "text", description: "Fixed-length text", aliases: ["CHAR"] },
    { name: "DATE", kind: "date", description: "Calendar date" },
    { name: "DATETIME2", kind: "date", description: "Date and time", aliases: ["DATETIME"] },
    { name: "DATETIMEOFFSET", kind: "date", description: "Date and time with offset" },
    { name: "TIME", kind: "time", description: "Time of day" },
    { name: "UNIQUEIDENTIFIER", kind: "uuid", description: "GUID" },
    {
      name: "VARBINARY(MAX)",
      kind: "binary",
      description: "Bytes up to 2 GB",
      aliases: ["VARBINARY"],
    },
    { name: "XML", kind: "text", description: "XML document" },
  ],
  duckdb: [
    { name: "INTEGER", kind: "number", description: "4-byte integer", aliases: ["INT", "INT4"] },
    { name: "BIGINT", kind: "number", description: "8-byte integer", aliases: ["INT8"] },
    { name: "HUGEINT", kind: "number", description: "16-byte integer", aliases: ["INT128"] },
    { name: "SMALLINT", kind: "number", description: "2-byte integer", aliases: ["INT2"] },
    {
      name: "DOUBLE",
      kind: "number",
      description: "8-byte floating point",
      aliases: ["FLOAT8"],
    },
    {
      name: "DECIMAL(10,2)",
      kind: "number",
      description: "Exact number of chosen precision",
      aliases: ["DECIMAL", "NUMERIC"],
    },
    { name: "BOOLEAN", kind: "boolean", description: "True or false", aliases: ["BOOL"] },
    {
      name: "VARCHAR",
      kind: "text",
      description: "Text of any length",
      aliases: ["TEXT", "STRING"],
    },
    { name: "DATE", kind: "date", description: "Calendar date" },
    { name: "TIME", kind: "time", description: "Time of day" },
    { name: "TIMESTAMP", kind: "date", description: "Date and time", aliases: ["DATETIME"] },
    {
      name: "TIMESTAMPTZ",
      kind: "date",
      description: "Date and time with time zone",
      aliases: ["TIMESTAMP WITH TIME ZONE"],
    },
    { name: "INTERVAL", kind: "time", description: "Span of time" },
    { name: "UUID", kind: "uuid", description: "Universally unique identifier" },
    { name: "JSON", kind: "json", description: "JSON document" },
    { name: "BLOB", kind: "binary", description: "Bytes", aliases: ["BYTEA"] },
    { name: "VARCHAR[]", kind: "array", description: "List of text" },
    { name: "STRUCT(a INTEGER)", kind: "other", description: "Named fields", aliases: ["STRUCT"] },
    {
      name: "MAP(VARCHAR, INTEGER)",
      kind: "other",
      description: "Key-value pairs",
      aliases: ["MAP"],
    },
  ],
};

const normalize = (type: string) => type.trim().replace(/\s+/g, " ").toLowerCase();
/** The type without its length or precision: "varchar(100)" → "varchar". */
const base = (type: string) => normalize(type).replace(/\s*\(.*\)$/, "");

/**
 * The catalog entry a declared type is. `exact` when it is that type by name or alias, not
 * only the same type with another length or precision ("varchar(100)" for "varchar(255)").
 */
export function matchDataType(
  types: readonly DataType[],
  declared: string,
): { type: DataType; exact: boolean } | undefined {
  const t = normalize(declared);
  if (!t) return undefined;
  const spellings = (d: DataType) => [d.name, ...(d.aliases ?? [])];
  const exact = types.find((d) => spellings(d).some((s) => normalize(s) === t));
  if (exact) return { type: exact, exact: true };
  const b = base(declared);
  const loose = types.find((d) => spellings(d).some((s) => base(s) === b));
  return loose && { type: loose, exact: false };
}
