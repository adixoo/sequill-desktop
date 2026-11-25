/**
 * Class for a row's action button inside a `group/row`: shown on hover, focus or while its
 * menu is open with a mouse, always shown on touch screens. `outline-hidden` keeps a focus
 * outline in forced colours, which drop the button's ring.
 */
export const ROW_ACTION_REVEAL =
  "[@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-hidden data-[state=open]:opacity-100";

/** Keyboard focus for flush rows and tabs: an inset outline, so overflow can't clip it and forced colours keep it. */
export const FOCUS_OUTLINE =
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
