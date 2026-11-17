import type { Ref } from "react";
import { useDbActions } from "@/shared/hooks/use-db-actions";
import { DB_FILE_ACCEPT } from "@/shared/lib/constants";

/**
 * A hidden file input that opens the picked database file. Render it outside menus and dialogs
 * and call `.click()` on it through `ref`: an input inside a menu is gone by the time the person
 * picks a file, so its change event never arrives.
 */
export function DbFileInput({ ref }: { ref: Ref<HTMLInputElement> }) {
  const actions = useDbActions();
  return (
    <input
      ref={ref}
      type="file"
      accept={DB_FILE_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void actions.openFile(file);
        e.target.value = "";
      }}
    />
  );
}
