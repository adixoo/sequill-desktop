import * as React from "react";
import { cn } from "cn";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from "@/shared/ui/dialog";
import { useIsMobile } from "@/shared/hooks/use-mobile";

/**
 * A dialog on wider screens and a bottom drawer on phones. Use it for forms and content;
 * confirmations stay in AlertDialog. Header, footer, title and description come from
 * `@/shared/ui/dialog`, since both share the same Radix primitive.
 */

/** How far (px) or how fast (px/ms) a downward drag on the handle has to go to close. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5;

const OpenChangeContext = React.createContext<((open: boolean) => void) | undefined>(undefined);

function ResponsiveDialog({ onOpenChange, ...props }: React.ComponentProps<typeof Dialog>) {
  return (
    <OpenChangeContext.Provider value={onOpenChange}>
      <Dialog onOpenChange={onOpenChange} {...props} />
    </OpenChangeContext.Provider>
  );
}

function ResponsiveDialogContent(props: React.ComponentProps<typeof DialogContent>) {
  const mobile = useIsMobile();
  return mobile ? <DrawerContent {...props} /> : <DialogContent {...props} />;
}

/** Follows a pointer dragging down from the handle and dismisses past a distance or speed. */
function useDragToDismiss(onDismiss: () => void) {
  const [offset, setOffset] = React.useState(0);
  const [start, setStart] = React.useState<{ y: number; time: number } | null>(null);
  const handlers: React.HTMLAttributes<HTMLDivElement> = {
    onPointerDown(e) {
      setStart({ y: e.clientY, time: e.timeStamp });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e) {
      if (start) setOffset(Math.max(0, e.clientY - start.y));
    },
    onPointerUp(e) {
      setStart(null);
      if (!start) return;
      const distance = e.clientY - start.y;
      const speed = distance / Math.max(1, e.timeStamp - start.time);
      if (distance > DISMISS_DISTANCE || speed > DISMISS_VELOCITY) onDismiss();
      else setOffset(0);
    },
    onPointerCancel() {
      setStart(null);
      setOffset(0);
    },
  };
  return { offset, dragging: start !== null, handlers };
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const onOpenChange = React.useContext(OpenChangeContext);
  const drag = useDragToDismiss(() => onOpenChange?.(false));
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-variant="drawer"
        data-dragging={drag.dragging || undefined}
        style={drag.offset ? { transform: `translateY(${drag.offset}px)` } : undefined}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-xl bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 transition-transform duration-200 ease-out outline-none data-dragging:transition-none motion-reduce:transition-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom"
        {...props}
      >
        <div
          aria-hidden
          className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
          {...drag.handlers}
        >
          <span className="rounded-pill h-1 w-10 bg-strong" />
        </div>
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 pt-1",
            // The footer runs to the screen's bottom edge: square corners, clear of the home bar,
            // with its buttons side by side to save height.
            "**:data-[slot=dialog-footer]:flex-row **:data-[slot=dialog-footer]:flex-wrap **:data-[slot=dialog-footer]:rounded-none **:data-[slot=dialog-footer]:pb-[calc(1rem+env(safe-area-inset-bottom))] **:data-[slot=dialog-footer]:*:data-[slot=button]:flex-1",
            className,
            // The drawer sets the size: a dialog's own width or height cap would spill past it.
            "max-h-none max-w-none sm:max-w-none",
          )}
        >
          {children}
        </div>
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button variant="ghost" className="absolute top-3 right-3" size="icon-sm">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export { ResponsiveDialog, ResponsiveDialogContent };
