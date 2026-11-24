/** Which editor dialog is open. One at a time; the DialogHost renders it lazily. */
import { create } from "zustand";
import type { DialogSpec } from "@/types/store/dialogs";

interface DialogState {
  dialog: DialogSpec | null;
  open(dialog: DialogSpec): void;
  close(): void;
}

export const useDialogs = create<DialogState>()((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));
