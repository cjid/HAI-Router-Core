import { describe, expect, it } from "vitest";
import {
  computeMenuPosition,
  filterOptions,
  findSelectedOption,
  normalizeOptions,
  valuesEqual,
} from "../../src/shared/components/selectUtils.js";

describe("selectUtils", () => {
  describe("normalizeOptions", () => {
    it("maps string options", () => {
      expect(normalizeOptions(["a", "b"])).toEqual([
        { value: "a", label: "a" },
        { value: "b", label: "b" },
      ]);
    });

    it("preserves object option fields", () => {
      expect(
        normalizeOptions([{ value: 4, label: "Four", description: "desc" }]),
      ).toEqual([{ value: 4, label: "Four", description: "desc", disabled: undefined, icon: undefined }]);
    });
  });

  describe("valuesEqual", () => {
    it("matches string and number loosely", () => {
      expect(valuesEqual(4, "4")).toBe(true);
      expect(valuesEqual("auto", "auto")).toBe(true);
      expect(valuesEqual(1, 2)).toBe(false);
    });
  });

  describe("findSelectedOption", () => {
    const opts = normalizeOptions([
      { value: "auto", label: "Auto" },
      { value: 10, label: "Ten" },
    ]);

    it("finds by value with type coercion", () => {
      expect(findSelectedOption(opts, 10)?.label).toBe("Ten");
      expect(findSelectedOption(opts, "auto")?.label).toBe("Auto");
    });
  });

  describe("filterOptions", () => {
    const opts = normalizeOptions([
      { value: "a", label: "Asia/Jakarta", description: "GMT+7" },
      { value: "b", label: "UTC" },
    ]);

    it("filters by label and description", () => {
      expect(filterOptions(opts, "jakarta")).toHaveLength(1);
      expect(filterOptions(opts, "gmt")).toHaveLength(1);
      expect(filterOptions(opts, "")).toHaveLength(2);
    });
  });

  describe("computeMenuPosition", () => {
    it("prefers bottom placement when space below", () => {
      const rect = { left: 100, top: 200, bottom: 240, width: 180, right: 280, height: 40, x: 100, y: 200, toJSON: () => ({}) };
      const pos = computeMenuPosition(rect, { maxMenuHeight: 320 });
      expect(pos.placement).toBe("bottom");
      expect(pos.top).toBe(246);
      expect(pos.minWidth).toBe(180);
    });

    it("flips above when little space below", () => {
      const rect = { left: 20, top: 10, bottom: 750, width: 120, right: 140, height: 40, x: 20, y: 10, toJSON: () => ({}) };
      const pos = computeMenuPosition(rect, { maxMenuHeight: 320 });
      expect(["top", "bottom"]).toContain(pos.placement);
    });
  });
});
