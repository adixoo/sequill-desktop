/**
 * Toasts: rare-ui's toast (https://github.com/swamimalode07/rare-ui) on Sonner, with its
 * animated status tiles and squircle card, restyled with Sequill's tokens (DESIGN.md:
 * pastel wash tiles with an ink glyph, never a solid red block).
 */
import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getSvgPath } from "figma-squircle";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Toaster as Sonner, toast as sonner, type ExternalToast, type ToasterProps } from "sonner";
import { cn } from "cn";
import { X } from "@/components/atoms/icons";
import { Spinner } from "@/components/atoms/spinner";

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

// card radius = tile radius + padding, so the corners stay concentric: --radius-xs + 8 = --radius-xl
const PADDING = 8;
const TILE = 32;
const TILE_RADIUS = 4;
const CARD_RADIUS = TILE_RADIUS + PADDING;

const squircle = (width: number, height: number, radius: number) =>
  getSvgPath({ width, height, cornerRadius: radius, cornerSmoothing: 1 });

const TILE_CLIP = `path('${squircle(TILE, TILE, TILE_RADIUS)}')`;

const TONES: Record<Exclude<ToastType, "default">, string> = {
  success: "bg-mint-wash text-mint-ink",
  error: "bg-rose-wash text-rose-ink",
  warning: "bg-butter-wash text-butter-ink",
  info: "bg-sky-wash text-sky-ink",
  loading: "bg-raised text-ink-muted",
};

const POP = { type: "spring", stiffness: 520, damping: 30 } as const;
// critically damped, so the tile eases in without the glyph's bounce
const SETTLE = { type: "spring", stiffness: 320, damping: 36 } as const;
const DRAW = { duration: 0.3, delay: 0.1, ease: "easeOut" } as const;
// sonner's enter slide is 400ms, so the icon waits for most of it before popping in
const ARRIVAL = 0.32;
const INSTANT = { duration: 0 } as const;
// a promise result waits for the spinner to leave, then the tile gives one small bump
const LEAVE = { duration: 0.14, ease: "easeIn" } as const;
const BUMP = {
  duration: 0.4,
  delay: LEAVE.duration,
  ease: "easeOut" as const,
  times: [0, 0.4, 1],
};

function Glyph({ type, reduced, delay }: { type: ToastType; reduced: boolean; delay: number }) {
  if (type === "loading") {
    return <Spinner aria-hidden className="size-4 motion-reduce:animate-none" />;
  }

  const stroke = {
    initial: reduced ? false : { pathLength: 0 },
    animate: { pathLength: 1 },
    transition: reduced ? INSTANT : { ...DRAW, delay: DRAW.delay + delay },
  } as const;

  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "success" && <motion.path d="M6 12.5l4 4 8-9" {...stroke} />}
      {type === "error" && (
        <>
          <motion.path d="M7.5 7.5l9 9" {...stroke} />
          <motion.path d="M16.5 7.5l-9 9" {...stroke} />
        </>
      )}
      {type === "warning" && (
        <>
          <motion.path d="M12 6v7" {...stroke} />
          <circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none" />
        </>
      )}
      {type === "info" && (
        <>
          <circle cx="12" cy="6.25" r="1.6" fill="currentColor" stroke="none" />
          <motion.path d="M12 11v7" {...stroke} />
        </>
      )}
    </svg>
  );
}

function ToastIcon({ type }: { type: Exclude<ToastType, "default"> }) {
  const reduced = useReducedMotion() ?? false;
  // only the first icon waits for the toast to land; a promise swap animates right away
  const [arrivingType] = useState(type);
  const settled = type !== arrivingType;
  const delay = settled ? 0 : ARRIVAL;

  return (
    <motion.span
      aria-hidden
      data-slot="toast-icon"
      initial={reduced ? false : { scale: 0.85, opacity: 0 }}
      animate={{ scale: settled ? [1, 1.08, 1] : 1, opacity: 1 }}
      transition={
        reduced ? INSTANT : settled ? { scale: BUMP } : { ...SETTLE, delay: ARRIVAL - 0.08 }
      }
      style={{ width: TILE, height: TILE, clipPath: TILE_CLIP }}
      className={cn(
        "relative shrink-0 transition-colors duration-200 motion-reduce:transition-none",
        TONES[type],
      )}
    >
      <AnimatePresence initial={!reduced} mode="wait">
        <motion.span
          key={type}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0, transition: reduced ? INSTANT : LEAVE }}
          transition={reduced ? INSTANT : { ...POP, delay }}
          className="absolute inset-0 grid place-items-center"
        >
          <Glyph type={type} reduced={reduced} delay={delay} />
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

// offset size, not getBoundingClientRect: sonner scales stacked toasts and that would skew the path
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: el.offsetWidth, height: el.offsetHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

type ToastCardProps = Omit<ComponentProps<"div">, "title"> & {
  toastId: string | number;
  type: ToastType;
  title: ReactNode;
  description?: ReactNode;
  action?: ToastAction;
  dismissible?: boolean;
};

export function ToastCard({
  toastId,
  type,
  title,
  description,
  action,
  dismissible = true,
  className,
  ...props
}: ToastCardProps) {
  const [cardRef, { width, height }] = useBoxSize<HTMLDivElement>();
  const outline = width > 0 ? squircle(width, height, CARD_RADIUS) : null;

  return (
    <div
      data-slot="toast"
      data-type={type}
      {...props}
      // drop-shadow, since a box-shadow would be cut off by the squircle clip
      className={cn(
        "relative size-full filter-[drop-shadow(var(--shadow-sm))_drop-shadow(var(--shadow-md))]",
        className,
      )}
    >
      <div
        ref={cardRef}
        style={{
          padding: PADDING,
          borderRadius: CARD_RADIUS,
          clipPath: outline ? `path('${outline}')` : undefined,
        }}
        className="relative flex h-full items-center bg-popover text-popover-foreground"
      >
        {outline && (
          <svg
            aria-hidden
            width={width}
            height={height}
            className="pointer-events-none absolute inset-0"
          >
            {/* half the stroke is clipped away, leaving a 1px inner hairline */}
            <path d={outline} fill="none" strokeWidth={2} className="stroke-hairline" />
          </svg>
        )}
        {/* sonner squeezes back toasts to the front one's height, so their content hides */}
        <div className="flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-300 group-data-[expanded=false]/toast:group-data-[front=false]/toast:opacity-0 motion-reduce:transition-none">
          {type !== "default" && <ToastIcon type={type} />}
          <div
            className={cn(
              "flex min-h-8 min-w-0 flex-1 flex-col justify-center",
              type === "default" && "pl-1.5",
            )}
          >
            <p data-slot="toast-title" className="text-sm leading-5 font-semibold text-ink">
              {title}
            </p>
            {description && (
              <p data-slot="toast-description" className="text-xs font-medium text-ink-soft">
                {description}
              </p>
            )}
          </div>
          {action && (
            <button
              type="button"
              data-slot="toast-action"
              onClick={() => {
                action.onClick();
                sonner.dismiss(toastId);
              }}
              className="h-8 shrink-0 cursor-pointer rounded-sm bg-raised px-3 text-xs font-semibold text-ink transition-[background-color,scale] outline-none hover:bg-active focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none"
            >
              {action.label}
            </button>
          )}
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          data-slot="toast-close"
          onClick={() => sonner.dismiss(toastId)}
          // sits on the corner, outside the clipped card, so it never pushes the content around
          className="absolute -top-1.5 -left-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-popover text-ink-muted opacity-0 ring-1 ring-hairline transition-[opacity,color] outline-none group-hover/toast:opacity-100 hover:text-ink focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 motion-reduce:transition-none [@media(hover:none)]:hidden"
        >
          <X className="size-2.5" strokeWidth={3} aria-hidden />
        </button>
      )}
    </div>
  );
}

function show(
  type: ToastType,
  title: ReactNode,
  { description, action, ...options }: ToastOptions = {},
) {
  return sonner.custom(
    (id) => (
      <ToastCard
        toastId={id}
        type={type}
        title={title}
        description={description}
        action={action}
        dismissible={options.dismissible}
      />
    ),
    // loading stays up until it is updated or dismissed; anything else clears that Infinity
    // when it replaces a loading toast by id
    type === "loading"
      ? { ...options, duration: options.duration ?? Infinity }
      : { duration: undefined, ...options },
  );
}

const variant = (type: ToastType) => (title: ReactNode, options?: ToastOptions) =>
  show(type, title, options);

export const toast = Object.assign(variant("default"), {
  success: variant("success"),
  error: variant("error"),
  warning: variant("warning"),
  info: variant("info"),
  loading: variant("loading"),
});

export type RareToasterProps = Omit<
  ToasterProps,
  "theme" | "richColors" | "invert" | "closeButton" | "icons"
>;

export function Toaster({
  position = "bottom-right",
  gap = 10,
  toastOptions,
  ...props
}: RareToasterProps) {
  // portaled so a z-index or transform on an ancestor can't trap or clip the stack
  return createPortal(
    <Sonner
      position={position}
      gap={gap}
      {...props}
      toastOptions={{
        unstyled: true,
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn("group/toast w-full", toastOptions?.classNames?.toast),
        },
      }}
    />,
    document.body,
  );
}
