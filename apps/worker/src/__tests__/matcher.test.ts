import { describe, it, expect } from "vitest";
import { matchTransfers, parseIsRanged } from "../matcher";
import type { DeadStockItem, RouItem, MatchOptions } from "../matcher";

// --- parseIsRanged ---

describe("parseIsRanged", () => {
  it('returns true for "checked"', () => {
    expect(parseIsRanged("checked")).toBe(true);
  });

  it('returns true for "Checked" (case-insensitive)', () => {
    expect(parseIsRanged("Checked")).toBe(true);
  });

  it('returns true for "YES"', () => {
    expect(parseIsRanged("YES")).toBe(true);
  });

  it('returns true for "true"', () => {
    expect(parseIsRanged("true")).toBe(true);
  });

  it('returns true for "1"', () => {
    expect(parseIsRanged("1")).toBe(true);
  });

  it('returns true for "y"', () => {
    expect(parseIsRanged("y")).toBe(true);
  });

  it('returns true for " Yes " (whitespace trimmed)', () => {
    expect(parseIsRanged(" Yes ")).toBe(true);
  });

  it('returns false for ""', () => {
    expect(parseIsRanged("")).toBe(false);
  });

  it('returns false for "no"', () => {
    expect(parseIsRanged("no")).toBe(false);
  });

  it('returns false for "false"', () => {
    expect(parseIsRanged("false")).toBe(false);
  });

  it('returns false for "0"', () => {
    expect(parseIsRanged("0")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(parseIsRanged(undefined)).toBe(false);
  });
});

// --- matchTransfers ---

describe("matchTransfers", () => {
  const defaultOpts: MatchOptions = { originStore: "OriginStore", monthsCoverTarget: 3 };

  describe("basic matching", () => {
    it("returns a result when dead stock SKU exists in another store ROU data", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Paracetamol 500mg", cost: 5.00 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: true }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(1);
      expect(results[0].sku).toBe("SKU001");
      expect(results[0].bestMatch.store).toBe("DestStore");
    });

    it("returns empty results when no SKU matches exist", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [{ sku: "SKU999", store: "DestStore", rou: 20, isRanged: true }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(0);
    });

    it("excludes origin store from destinations (case-insensitive)", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [
        { sku: "SKU001", store: "originstore", rou: 20, isRanged: true }, // same store, different case
        { sku: "SKU001", store: "OtherStore", rou: 15, isRanged: false },
      ];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "OriginStore", monthsCoverTarget: 3 });
      expect(results).toHaveLength(1);
      expect(results[0].allMatches).toHaveLength(1);
      expect(results[0].bestMatch.store).toBe("OtherStore");
    });

    it("excludes ROU items with rou <= 0", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 0, isRanged: true }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(0);
    });
  });

  describe("sell-through filter (MATCH-02)", () => {
    it("excludes destination where rou < soh / 12", () => {
      // soh=120, rou=5, minRou=10, 5 < 10 = excluded
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 120, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 5, isRanged: false }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(0);
    });

    it("includes destination at boundary where rou == soh / 12", () => {
      // soh=120, rou=10, minRou=10, 10 >= 10 = included
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 120, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 10, isRanged: false }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(1);
    });

    it("includes destination where rou > soh / 12", () => {
      // soh=120, rou=15, minRou=10, 15 > 10 = included
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 120, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 15, isRanged: false }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(1);
    });
  });

  describe("months-cover cap (MATCH-03, MATCH-04)", () => {
    it("caps transfer qty to max(0, target*rou - destSOH)", () => {
      // target=3, rou=20, destSOH=10, maxQty=50, originSOH=240, transfer=50
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 240, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: false, soh: 10 }];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 3 });
      expect(results[0].bestMatch.qtyToTransfer).toBe(50);
    });

    it("excludes store when destSOH >= target*rou", () => {
      // target=3, rou=20, destSOH=65, maxQty=0, excluded
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 240, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: false, soh: 65 }];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 3 });
      expect(results).toHaveLength(0);
    });

    it("defaults destSOH to 0 when soh field absent on RouItem", () => {
      // target=3, rou=20, destSOH absent=0, maxQty=60, originSOH=240, transfer=60
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 240, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: false }]; // no soh
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 3 });
      expect(results[0].bestMatch.qtyToTransfer).toBe(60);
    });

    it("transfer qty cannot exceed originSOH", () => {
      // target=6, rou=100, destSOH=0, maxQty=600, originSOH=50, transfer=50
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 50, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 100, isRanged: false, soh: 0 }];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 6 });
      expect(results[0].bestMatch.qtyToTransfer).toBe(50);
    });
  });

  describe("sort order (MATCH-05)", () => {
    it("sorts ranged items before non-ranged", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 10, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [
        { sku: "SKU001", store: "StoreA", rou: 30, isRanged: false },
        { sku: "SKU001", store: "StoreB", rou: 10, isRanged: true },
      ];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 6 });
      expect(results[0].allMatches[0].isRanged).toBe(true);
      expect(results[0].allMatches[1].isRanged).toBe(false);
    });

    it("sorts by ROU descending within ranged group", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 10, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [
        { sku: "SKU001", store: "StoreA", rou: 10, isRanged: true },
        { sku: "SKU001", store: "StoreB", rou: 25, isRanged: true },
      ];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 6 });
      expect(results[0].allMatches[0].rou).toBe(25);
      expect(results[0].allMatches[1].rou).toBe(10);
    });

    it("sorts by ROU descending within non-ranged group", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 10, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [
        { sku: "SKU001", store: "StoreA", rou: 5, isRanged: false },
        { sku: "SKU001", store: "StoreB", rou: 15, isRanged: false },
      ];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 6 });
      expect(results[0].allMatches[0].rou).toBe(15);
      expect(results[0].allMatches[1].rou).toBe(5);
    });
  });

  describe("NaN/missing values (MATCH-07)", () => {
    it("excludes RouItem with NaN rou and emits warning", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: NaN, isRanged: false }];
      const { results, warnings } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(0);
      expect(warnings).toContainEqual(expect.objectContaining({ sku: "SKU001", field: "rou" }));
    });

    it("excludes DeadStockItem with NaN soh and emits warning", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: NaN, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: false }];
      const { results, warnings } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(0);
      expect(warnings).toContainEqual(expect.objectContaining({ sku: "SKU001", field: "soh" }));
    });

    it("includes DeadStockItem with NaN cost (cost=0 in result) and emits warning", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 100, description: "Item", cost: NaN }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 20, isRanged: false }];
      const { results, warnings } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results).toHaveLength(1);
      expect(results[0].cost).toBe(0);
      expect(warnings).toContainEqual(expect.objectContaining({ sku: "SKU001", field: "cost" }));
    });
  });

  describe("sellThrough calculation", () => {
    it("computes sellThrough as originSOH / destROU", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 120, description: "Item", cost: 10 }];
      const rouData: RouItem[] = [{ sku: "SKU001", store: "DestStore", rou: 10, isRanged: false }];
      const { results } = matchTransfers(deadStock, rouData, defaultOpts);
      expect(results[0].bestMatch.sellThrough).toBe(12);
    });
  });

  describe("multiple destination matches", () => {
    it("populates allMatches with all qualifying stores and bestMatch with first sorted", () => {
      const deadStock: DeadStockItem[] = [{ sku: "SKU001", soh: 24, description: "Item", cost: 5 }];
      const rouData: RouItem[] = [
        { sku: "SKU001", store: "StoreA", rou: 5, isRanged: false },
        { sku: "SKU001", store: "StoreB", rou: 10, isRanged: true },
        { sku: "SKU001", store: "StoreC", rou: 8, isRanged: true },
      ];
      const { results } = matchTransfers(deadStock, rouData, { originStore: "Origin", monthsCoverTarget: 6 });
      expect(results).toHaveLength(1);
      expect(results[0].allMatches).toHaveLength(3);
      // bestMatch = first sorted = StoreB (ranged, rou=10)
      expect(results[0].bestMatch.store).toBe("StoreB");
      expect(results[0].bestMatch.isRanged).toBe(true);
    });
  });
});
