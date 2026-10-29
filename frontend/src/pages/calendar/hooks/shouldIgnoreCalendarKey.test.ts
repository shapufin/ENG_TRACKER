import { afterEach, describe, expect, it } from "vitest";
import { shouldIgnoreCalendarKey } from "./shouldIgnoreCalendarKey";

const keyEvent = (target: EventTarget | null) =>
  ({ target, defaultPrevented: false }) as unknown as KeyboardEvent;

describe("shouldIgnoreCalendarKey", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lets arrows through when nothing is focused", () => {
    expect(shouldIgnoreCalendarKey(keyEvent(document.body))).toBe(false);
  });

  it.each(["input", "textarea", "select"])("ignores a focused <%s>", (tag) => {
    expect(shouldIgnoreCalendarKey(keyEvent(document.createElement(tag)))).toBe(true);
  });

  it("ignores a contenteditable target", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(shouldIgnoreCalendarKey(keyEvent(el))).toBe(true);
  });

  it.each(["dialog", "menu", "listbox"])("ignores arrows while a %s is open", (role) => {
    document.body.innerHTML = `<div role="${role}"></div>`;
    expect(shouldIgnoreCalendarKey(keyEvent(document.body))).toBe(true);
  });

  it("ignores a key another handler already consumed", () => {
    const consumed = { target: document.body, defaultPrevented: true } as unknown as KeyboardEvent;
    expect(shouldIgnoreCalendarKey(consumed)).toBe(true);
  });
});
