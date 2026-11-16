import { useCopy } from "@/shared/hooks/use-copy";
import { highlightLines, type CodeLanguage, type CodeTokenType } from "@/shared/lib/highlight-code";
import { cn } from "@/shared/lib/utils";
import { Check, Copy } from "@/shared/ui/icons";

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
  /** Wraps long lines instead of scrolling sideways. */
  wrap?: boolean;
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
  className,
}: CodeBlockProps) {
  const lines = highlightLines(code, language);
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md bg-surface ring-2 ring-hairline ring-inset",
        className,
      )}
    >
      <figcaption className="flex h-11 items-center gap-2 border-b-2 border-hairline bg-raised pr-1.5 pl-4">
        <span aria-hidden className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-strong" />
          ))}
        </span>
        <span className="ml-2 min-w-0 flex-1 truncate font-mono text-xs font-medium tracking-[0.04em] text-ink-soft">
          {fileName}
        </span>
        {copyable && <CopyCodeButton code={code} fileName={fileName} />}
      </figcaption>
      <pre
        className={cn(
          "py-4 font-mono text-[0.8125rem] leading-[1.7] md:text-sm",
          wrap ? "whitespace-pre-wrap" : "overflow-x-auto",
        )}
      >
        <code>
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn(
                "mx-2 flex rounded-xs pr-4",
                highlightLine === i + 1 && "bg-lilac-wash",
              )}
            >
              <span aria-hidden className="w-10 shrink-0 pr-4 text-right text-decor select-none">
                {i + 1}
              </span>
              <span className={cn(wrap && "min-w-0 wrap-anywhere")}>
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
function CopyCodeButton({ code, fileName }: { code: string; fileName: string }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => void copy(code)}
      title={`Copy ${fileName}`}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium",
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
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
