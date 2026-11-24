export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  /** Epoch ms of the last save; the list is newest first. */
  updatedAt: number;
}
