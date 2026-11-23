import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** How long a copy button says "Copied" before going back to "Copy". */
const COPIED_MS = 1800;

/** Copies text to the clipboard and reports `copied` for a moment afterwards. */
export function useCopy(): { copied: boolean; copy(text: string): Promise<void> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error("The browser blocked clipboard access");
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return { copied, copy };
}
