export { cn } from "cn";

/** A short random id for client-side records (tabs, saved queries). */
export const newId = (): string => Math.random().toString(36).slice(2, 10);
