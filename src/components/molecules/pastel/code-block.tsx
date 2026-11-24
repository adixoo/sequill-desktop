import { useCopy } from "@/hooks/use-copy";
import { highlightLines, type CodeLanguage, type CodeTokenType } from "@/utils/highlight-code";
import { cn } from "@/utils";
import { Check, Copy } from "@/components/atoms/icons";

const TOKEN_CLASS: Record<CodeTokenType, string> = {
  keyword: "text-lilac-ink",
  string: "text-mint-ink",
  number: "text-peach-ink",
  comment: "text-ink-muted italic",
  fn: "text-sky-ink",
  property: "text-sky-ink",
  punct: "text-ink-soft",
  plain: "text-ink",
};

interface CodeBlockProps {
  fileName: string;
  code: string;
  /** How to colour the code; SQL unless said otherwise. */
  language?: CodeLanguage;
  /** 1-based line that gets the lilac wash. */
  highlightLine?: number;
  /** Shows a Copy button in the title bar. */
  copyable?: boolean;
  /** Wraps long lines instead of scrolling sideways, so a one-line command reads whole. */
  wrap?: boolean;
  /** Just the code: no title bar or line numbers, and Copy as an icon in the corner. */
  bare?: boolean;
  className?: string;
}

/** Editor window for code on screen. */
export function CodeBlock({
  fileName,
  code,
  language = "sql",
  highlightLine,
  copyable,
  wrap,
  bare,
  className,
}: CodeBlockProps) {
  const lines = highlightLines(code, language);
  return (
    <figure
      className={cn(
        "relative overflow-hidden rounded-md border border-hairline bg-surface",
        className,
      )}
    >
      {bare && copyable && (
        <div className="absolute top-1 right-1">
          <CopyCodeButton code={code} fileName={fileName} compact />
        </div>
      )}
      {!bare && (
        <figcaption className="flex h-11 items-center gap-2 border-b border-hairline bg-raised pr-1.5 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-ink-soft">
            {fileName}
          </span>
          {copyable && <CopyCodeButton code={code} fileName={fileName} />}
        </figcaption>
      )}
      {/* Long lines scroll sideways; `w-max` lets each line's wash span the widest line. */}
      <pre
        className={cn(
          "overflow-x-auto font-mono text-[0.8125rem] leading-[1.7]",
          bare ? "py-2 pr-9" : "py-4 md:text-sm",
        )}
      >
        <code className={cn("block min-w-full", bare ? "px-3" : "px-2", !wrap && "w-max")}>
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn("flex rounded-xs pr-4", highlightLine === i + 1 && "bg-lilac-wash")}
            >
              {!bare && (
                <span aria-hidden className="w-10 shrink-0 pr-4 text-right text-decor select-none">
                  {i + 1}
                </span>
              )}
              <span className={cn(wrap && "min-w-0 wrap-anywhere whitespace-pre-wrap")}>
                {line.map((t, j) => (
                  <span key={j} className={TOKEN_CLASS[t.type]}>
                    {t.text}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

/** Copy button that turns into a tick for a moment once the code is on the clipboard. */
function CopyCodeButton({
  code,
  fileName,
  compact,
}: {
  code: string;
  fileName: string;
  /** Icon only (the label stays for screen readers). */
  compact?: boolean;
}) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(code)}
      title={`Copy ${fileName}`}
      aria-label={compact ? `Copy ${fileName}` : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-sm text-xs font-medium",
        compact ? "size-7 justify-center" : "h-8 px-2.5",
        "transition-[background-color,color] duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        copied ? "bg-mint-wash text-mint-ink" : "text-ink-soft hover:bg-surface hover:text-ink",
      )}
    >
      <span className="relative size-3.5">
        <Copy
          className={cn(
            "absolute inset-0 size-3.5 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            copied ? "scale-50 opacity-0" : "scale-100 opacity-100",
          )}
        />
        <Check
          strokeWidth={2.5}
          className={cn(
            "absolute inset-0 size-3.5 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
            copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        />
      </span>
      <span aria-live="polite" className={cn(compact && "sr-only")}>
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
