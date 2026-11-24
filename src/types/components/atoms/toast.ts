import type { ReactNode } from "react";
import type { ExternalToast, ToasterProps } from "sonner";

export type ToastType = "default" | "success" | "error" | "warning" | "info" | "loading";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

// sonner's own styling options don't reach a custom toast, so they're left out
type SonnerStyling =
  | "icon"
  | "richColors"
  | "invert"
  | "closeButton"
  | "unstyled"
  | "classNames"
  | "descriptionClassName"
  | "cancel"
  | "cancelButtonStyle"
  | "actionButtonStyle";

export type ToastOptions = Omit<ExternalToast, SonnerStyling | "description" | "action"> & {
  description?: ReactNode;
  action?: ToastAction;
};

export type RareToasterProps = Omit<
  ToasterProps,
  "theme" | "richColors" | "invert" | "closeButton" | "icons"
>;
