export type WireCell =
  null | number | string | { $bigint: string } | { $blob: string } | { $real: string };
