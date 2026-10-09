import { describe, it, expect } from "vitest";
import { defaultAdminLayout } from "@/components/dashboard/widgetRegistry";
import {
  packVertical,
  sameItems,
  toGridItems,
} from "@/pages/admin/components/dashboard-grid/gridLayout";

describe("defaultAdminLayout", () => {
  it("is already vertically packed, so a click on a grip has nothing to compact and save", () => {
    const items = toGridItems(
      defaultAdminLayout,
      "lg",
      defaultAdminLayout.widgets.map((w) => w.id)
    );
    expect(sameItems(packVertical(items), items)).toBe(true);
  });
});
