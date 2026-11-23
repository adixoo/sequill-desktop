import { describe, expect, test } from "vitest";
import { editorHref, isInAppClick } from "@/lib/router";

const click = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("router", () => {
  test("only plain left clicks stay in the app", () => {
    expect(isInAppClick(click)).toBe(true);
    expect(isInAppClick({ ...click, button: 1 })).toBe(false);
    expect(isInAppClick({ ...click, ctrlKey: true })).toBe(false);
    expect(isInAppClick({ ...click, metaKey: true })).toBe(false);
    expect(isInAppClick({ ...click, shiftKey: true })).toBe(false);
    expect(isInAppClick({ ...click, defaultPrevented: true })).toBe(false);
  });

  test("links to a table encode its name", () => {
    expect(editorHref()).toBe("/");
    expect(editorHref("order items & more")).toBe("/?table=order%20items%20%26%20more");
  });
});
