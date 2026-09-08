/** Tests for the generated vocabulary metadata.

 These guard against drift between the backend canonical allowlists in
 plugins/organigrama/models.py and the frontend's hand-maintained copies.
 The metadata is emitted by scripts/generate_organigrama_meta.py; if a
 backend constant changes, regenerating must update these arrays and the
 --check mode in CI catches a stale file.
 */
import { describe, it, expect } from "vitest";
import {
  SHAPE_TYPES,
  EDGE_TYPES,
  HIERARCHY_EDGE_TYPES,
  CONTAINER_SHAPE_TYPES,
  CONTAINER_SHAPE_TYPE_SET,
  NODE_STATUSES,
  ROLE_CODES,
} from "../generatedMeta";
import { CONTAINER_SHAPE_TYPES as GROUP_HELPERS_CONTAINERS } from "../pages/groupHelpers";

describe("generatedMeta", () => {
  it("exports the full backend shape vocabulary", () => {
    expect(SHAPE_TYPES).toEqual([
      "person",
      "position",
      "vacant",
      "external",
      "department",
      "division",
      "team",
      "location",
      "label",
      "section",
      "placeholder",
    ]);
  });

  it("exports the full backend edge vocabulary", () => {
    expect(EDGE_TYPES).toEqual([
      "reports_to",
      "dotted_line",
      "assistant",
      "association",
      "contains",
    ]);
  });

  it("exports the hierarchy edge subset", () => {
    expect(HIERARCHY_EDGE_TYPES).toEqual(["reports_to", "contains"]);
  });

  it("exports the container shape allowlist", () => {
    expect(CONTAINER_SHAPE_TYPES).toEqual([
      "section",
      "department",
      "division",
      "team",
      "location",
    ]);
  });

  it("exports a readonly set matching the container array", () => {
    expect(CONTAINER_SHAPE_TYPE_SET).toBeInstanceOf(Set);
    for (const shape of CONTAINER_SHAPE_TYPES) {
      expect(CONTAINER_SHAPE_TYPE_SET.has(shape)).toBe(true);
    }
    expect(CONTAINER_SHAPE_TYPE_SET.has("person")).toBe(false);
  });

  it("exports the node status vocabulary", () => {
    expect(NODE_STATUSES).toEqual(["active", "vacant", "planned", "archived"]);
  });

  it("exports the canonical role codes", () => {
    expect(ROLE_CODES).toEqual(["employee", "italian_tl", "albanian_tl", "hr", "cr_admin"]);
  });
});

describe("generatedMeta consumption", () => {
  it("groupHelpers re-exports the generated container set", () => {
    // The builder's container detection must use the generated allowlist,
    // not a hand-maintained copy that can drift from the backend.
    expect(GROUP_HELPERS_CONTAINERS).toBe(CONTAINER_SHAPE_TYPE_SET);
  });

  it("container set membership matches the array", () => {
    // Sanity: the set used by isContainerNode must agree with the array
    // exported from generatedMeta, so builder and viewer container checks
    // cannot diverge.
    for (const shape of CONTAINER_SHAPE_TYPES) {
      expect(GROUP_HELPERS_CONTAINERS.has(shape)).toBe(true);
    }
    expect(GROUP_HELPERS_CONTAINERS.has("person")).toBe(false);
  });
});
