import { useState, type DragEvent } from "react";

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");

/**
 * Makes an element a drop target for one file: spread `props` on it, read `over` to show
 * that a file is being dragged over it. Drops stop here, so window-wide drop handlers
 * (the editor's "drop a database anywhere") don't also take the file.
 */
export function useFileDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  const accept = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(true);
  };
  return {
    over,
    props: {
      onDragEnter: accept,
      onDragOver: accept,
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        // Moving onto a child fires a leave on the parent; only leaving the element counts.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      },
    },
  };
}
