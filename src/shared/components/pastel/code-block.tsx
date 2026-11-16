import { tokenizeSql, type TokenType } from "@/shared/lib/sqlite/highlight";
import { cn } from "@/shared/lib/utils";

const TOKEN_CLASS: Record<TokenType, string> = {
  keyword: "text-lilac-ink",
  string: "text-mint-ink",
  number: "text-peach-ink",
  comment: "text-ink-muted italic",
  fn: "text-sky-ink",
  punct: "text-ink-soft",
  ident: "text-ink",
  space: "",
};

interface CodeBlockProps {
  fileName: string;
  code: string;
  /** 1-based line that gets the lilac wash. */
  highlightLine?: number;
  className?: string;
}

/** Editor window for SQL on screen. */
export function CodeBlock({ fileName, code, highlightLine, className }: CodeBlockProps) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-md bg-surface ring-2 ring-hairline ring-inset",
        className,
      )}
    >
      <figcaption className="flex h-11 items-center gap-2 border-b-2 border-hairline bg-raised px-4">
        <span aria-hidden className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-strong" />
          ))}
        </span>
        <span className="ml-2 font-mono text-xs font-medium tracking-[0.04em] text-ink-soft">
          {fileName}
        </span>
      </figcaption>
      <pre className="overflow-x-auto py-4 font-mono text-[0.8125rem] leading-[1.7] md:text-sm">
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
              <span>
                {tokenizeSql(line).map((t, j) => (
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
