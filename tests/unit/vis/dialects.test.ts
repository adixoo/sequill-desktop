import { describe, expect, test } from "vitest";
import { IMPORT_DIALECTS, suggestSchemaName } from "@/features/vis/lib/dialects";

const dialect = (value: string) => IMPORT_DIALECTS.find((d) => d.value === value)!;

describe("suggestSchemaName", () => {
  test("takes the database a mysqldump names in its header", () => {
    const sql = "-- MySQL dump 10.13\n--\n-- Host: localhost    Database: shop_prod\n-- ----\n";
    expect(suggestSchemaName(dialect("mysql"), sql, "dump.sql")).toBe("shop_prod");
  });

  test("takes the database the PostgreSQL query names on its first line", () => {
    const sql = "-- Database: tickets\n\nCREATE TABLE t ();";
    expect(suggestSchemaName(dialect("postgresql"), sql)).toBe("tickets");
  });

  test("takes CREATE DATABASE, quoted or not", () => {
    expect(suggestSchemaName(dialect("mysql"), "CREATE DATABASE IF NOT EXISTS `crm`;")).toBe("crm");
    expect(suggestSchemaName(dialect("postgresql"), 'CREATE DATABASE "billing";')).toBe("billing");
  });

  test("takes SQL Server's USE [name]", () => {
    expect(
      suggestSchemaName(dialect("mssql"), "USE [Inventory]\nGO\nCREATE TABLE t (id int);"),
    ).toBe("Inventory");
  });

  test("takes psql's \\connect", () => {
    expect(suggestSchemaName(dialect("postgresql"), "\\connect tickets\nCREATE TABLE t ();")).toBe(
      "tickets",
    );
  });

  test("falls back to the file's name without its extension", () => {
    expect(suggestSchemaName(dialect("postgresql"), "CREATE TABLE t ();", "orders.v2.sql")).toBe(
      "orders.v2",
    );
  });

  test("falls back to the database's label when nothing names it", () => {
    expect(suggestSchemaName(dialect("duckdb"), "CREATE TABLE t (id INTEGER);")).toBe(
      "DuckDB schema",
    );
    expect(suggestSchemaName(dialect("sqlite"), "", "")).toBe("SQLite schema");
  });

  test("ignores USE and CREATE DATABASE inside other words", () => {
    expect(suggestSchemaName(dialect("mysql"), "CREATE TABLE reuse (id int);")).toBe(
      "MySQL / MariaDB schema",
    );
  });
});
