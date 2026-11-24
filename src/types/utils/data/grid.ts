export interface LaidOutColumn {
  name: string;
  /** Index into the row arrays. */
  index: number;
  width: number;
  pinned: boolean;
  /** Sticky left offset for pinned columns (excluding the row-number column). */
  left: number;
}
