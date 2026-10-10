import { describe, it, expect } from "vitest";
import { Cpu, FileSpreadsheet } from "lucide-react";
import { TARGET_ICONS, targetIcon } from "./targetIcons";

const BACKEND_ICON_NAMES = [
  "Building2",
  "FolderTree",
  "Sparkles",
  "CalendarDays",
  "Cpu",
  "MonitorCog",
  "CalendarCheck",
  "UsersRound",
  "Star",
  "CalendarRange",
  "PhoneCall",
  "Users",
  "Clock",
  "Banknote",
];

describe("targetIcon", () => {
  it("maps a backend icon name to its lucide icon", () => {
    expect(targetIcon("Cpu")).toBe(Cpu);
  });

  it("falls back to FileSpreadsheet for unknown or empty names", () => {
    expect(targetIcon("Nope")).toBe(FileSpreadsheet);
    expect(targetIcon("")).toBe(FileSpreadsheet);
    expect(targetIcon(undefined)).toBe(FileSpreadsheet);
  });

  it.each(BACKEND_ICON_NAMES)("has an entry for %s", (name) => {
    expect(TARGET_ICONS[name]).toBeDefined();
    expect(targetIcon(name)).toBe(TARGET_ICONS[name]);
  });
});
