/** CodeMirror theme built from Pastel Noir tokens, so it follows light and dark mode. */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const view = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "var(--surface)",
    fontSize: "13.5px",
    height: "100%",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.7" },
  ".cm-content": { caretColor: "var(--ink)", padding: "12px 0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ink)", borderLeftWidth: "2px" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--sky-wash) !important",
  },
  ".cm-activeLine": { backgroundColor: "var(--lilac-wash)" },
  ".cm-gutters": { backgroundColor: "var(--surface)", color: "var(--decor)", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--ink-muted)" },
  ".cm-lineNumbers .cm-gutterElement": { paddingRight: "16px", minWidth: "40px" },
  ".cm-matchingBracket": { backgroundColor: "var(--butter-wash)", outline: "none" },
  ".cm-tooltip": {
    backgroundColor: "var(--raised)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-xs)",
    color: "var(--ink)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--sky-wash)",
    color: "var(--ink)",
  },
  ".cm-completionDetail": { color: "var(--ink-muted)" },
  ".cm-placeholder": { color: "var(--ink-muted)" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--code-number)" },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: "var(--code-fn)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--code-comment)",
    fontStyle: "italic",
  },
  { tag: [t.punctuation, t.operator, t.bracket], color: "var(--code-punct)" },
  { tag: [t.typeName], color: "var(--code-fn)" },
  { tag: [t.special(t.name), t.quote], color: "var(--ink)" },
]);

export const pastelEditorTheme = [view, syntaxHighlighting(highlight)];
