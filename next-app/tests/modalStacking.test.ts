/**
 * Stacking + modal layout guards.
 *
 * Regression: on a phone the modal could sit under shell chrome, and shell.css's
 * bare `.prompt` toast rule — which loads after global.css — turned the modal's
 * content wrapper into a viewport-fixed bar. Together they hid the notification
 * gate's "Allow" button and the location prompt's "Use my current location"
 * button.
 *
 * The boot splash has to stay on top of all of it so the first-load gate never
 * pops over the splash.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shellCss = readFileSync(resolve(__dirname, "../ui/styles/shell.css"), "utf8");
const globalCss = readFileSync(resolve(__dirname, "../ui/styles/global.css"), "utf8");

/** First `z-index: N` inside the first block that starts with `selector`. */
function zIndexAt(css: string, selector: string): number {
  const at = css.indexOf(selector);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  const block = css.slice(css.indexOf("{", at), css.indexOf("}", at));
  const match = block.match(/z-index:\s*(\d+)/);
  expect(match, `${selector} has no z-index`).toBeTruthy();
  return Number(match![1]);
}

function blockOf(css: string, selector: string): string {
  const at = css.indexOf(selector);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  return css.slice(css.indexOf("{", at), css.indexOf("}", at));
}

describe("modal stacking — action buttons must never sit under shell chrome", () => {
  it("renders the modal above the bottom nav, toasts and drawer", () => {
    const modal = zIndexAt(globalCss, ".modal {");
    expect(modal).toBeGreaterThan(zIndexAt(shellCss, ".shell__nav--bottom {"));
    expect(modal).toBeGreaterThan(zIndexAt(shellCss, ".prompt-stack {"));
    expect(modal).toBeGreaterThan(zIndexAt(shellCss, ".shell__overlay {"));
  });

  it("keeps the boot splash above the modal", () => {
    expect(zIndexAt(shellCss, ".splash {")).toBeGreaterThan(zIndexAt(globalCss, ".modal {"));
  });
});

describe("modal layout — the footer action is always on screen", () => {
  it("scopes shell.css's fixed `.prompt` toast out of the modal", () => {
    expect(blockOf(globalCss, ".modal .prompt {")).toMatch(/position:\s*static/);
  });

  it("scrolls only the body, keeping header and actions fixed", () => {
    expect(blockOf(globalCss, ".modal__body {")).toMatch(/overflow-y:\s*auto/);
    expect(blockOf(globalCss, ".modal__actions {")).toMatch(/flex:\s*0 0 auto/);
  });

  it("clears the phone home indicator under the card", () => {
    expect(blockOf(globalCss, ".modal {")).toMatch(/safe-bottom/);
  });
});
