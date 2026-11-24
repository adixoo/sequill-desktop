export interface LoaderStage {
  label: string;
  state: "done" | "active" | "pending";
}
