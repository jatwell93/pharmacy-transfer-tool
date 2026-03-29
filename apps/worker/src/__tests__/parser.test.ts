import { describe, it, expect } from "vitest";
import {
  parseCSV,
  findHeaderRow,
  buildColumnMap,
  parseRouFile,
  parseDeadStockFile,
} from "../lib/parser";

// --- Test helpers ---

function csvToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

function bomCsvToBuffer(text: string): ArrayBuffer {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const content = new TextEncoder().encode(text);
  const combined = new Uint8Array(bom.length + content.length);
  combined.set(bom);
  combined.set(content, bom.length);
  return combined.buffer as ArrayBuffer;
}

// --- parseCSV ---

describe("parseCSV", () => {
  it("strips UTF-8 BOM prefix so BOM CSV equals non-BOM CSV", () => {
    const plain = csvToBuffer("Item Code,SOH\nSKU001,10");
    const bom = bomCsvToBuffer("Item Code,SOH\nSKU001,10");
    expect(parseCSV(bom)).toEqual(parseCSV(plain));
  });

  it("normalises CRLF line endings to produce same output as LF", () => {
    const lf = csvToBuffer("Item Code,SOH\nSKU001,10");
    const crlf = csvToBuffer("Item Code,SOH\r\nSKU001,10\r\n");
    expect(parseCSV(crlf)).toEqual(parseCSV(lf));
  });

  it("filters out blank/empty lines", () => {
    const buf = csvToBuffer("\n\nItem Code,SOH\nSKU001,10\n\n");
    const rows = parseCSV(buf);
    // Should have exactly 2 non-empty rows
    expect(rows.every((r) => r.some((cell) => cell.trim() !== ""))).toBe(true);
    expect(rows.length).toBe(2);
  });

  it("handles quoted fields containing commas", () => {
    const buf = csvToBuffer('Item Code,Description\nSKU001,"Smith, John"');
    const rows = parseCSV(buf);
    expect(rows.length).toBe(2);
    expect(rows[1][1]).toBe("Smith, John");
  });
});

// --- findHeaderRow ---

describe("findHeaderRow", () => {
  it("returns 0 when header is the first row", () => {
    const rows = [
      ["Item Code", "Item Description", "ROU Value", "SOH"],
      ["SKU001", "Paracetamol", "2.5", "10"],
    ];
    expect(findHeaderRow(rows, ["Item Code", "ROU", "SOH"])).toBe(0);
  });

  it("returns 2 when there are 2 blank/title rows above the header", () => {
    const rows = [
      ["Store Report — Balwyn"],
      [""],
      ["Item Code", "Item Description", "ROU Value", "SOH"],
      ["SKU001", "Paracetamol", "2.5", "10"],
    ];
    expect(findHeaderRow(rows, ["Item Code", "ROU", "SOH"])).toBe(2);
  });

  it("returns -1 when no row matches the required headers", () => {
    const rows = [
      ["Name", "Price", "Qty"],
      ["Widget A", "9.99", "50"],
    ];
    expect(findHeaderRow(rows, ["Item Code", "ROU", "SOH"])).toBe(-1);
  });
});

// --- buildColumnMap ---

describe("buildColumnMap", () => {
  it("maps canonical column names to correct indices", () => {
    const header = ["Item Code", "Item Description", "ROU Value", "SOH"];
    const map = buildColumnMap(header);
    expect(map["Item Code"]).toBe(0);
    expect(map["ROU"]).toBe(2);
    expect(map["SOH"]).toBe(3);
  });

  it("maps aliased column names to correct indices", () => {
    const header = ["SKU", "Desc", "Usage Rate", "Stock on Hand"];
    const map = buildColumnMap(header);
    expect(map["Item Code"]).toBe(0); // "SKU" is alias for "Item Code"
    expect(map["ROU"]).toBe(2); // "Usage Rate" is alias for "ROU"
    expect(map["SOH"]).toBe(3); // "Stock on Hand" is alias for "SOH"
  });
});

// --- parseRouFile ---

describe("parseRouFile", () => {
  it("parses standard CSV with canonical headers to RouRow[]", () => {
    const csv =
      "Item Code,Item Description,ROU Value,SOH\nSKU001,Paracetamol 500mg,2.5,10\nSKU002,Ibuprofen 200mg,1.2,5\n";
    const buf = csvToBuffer(csv);
    const rows = parseRouFile(buf, "test.csv");
    expect(rows.length).toBe(2);
    expect(rows[0].sku).toBe("SKU001");
    expect(rows[0].description).toBe("Paracetamol 500mg");
    expect(rows[0].rou).toBe(2.5);
    expect(rows[0].soh).toBe(10);
  });

  it("parses aliased headers ('SKU', 'Usage Rate', 'Stock on Hand') correctly", () => {
    const csv =
      "SKU,Description,Usage Rate,Stock on Hand\nSKU001,Paracetamol,2.5,10\n";
    const buf = csvToBuffer(csv);
    const rows = parseRouFile(buf, "rou.csv");
    expect(rows.length).toBe(1);
    expect(rows[0].sku).toBe("SKU001");
    expect(rows[0].rou).toBe(2.5);
    expect(rows[0].soh).toBe(10);
  });

  it("skips rows where Item Code cell is empty or whitespace", () => {
    const csv =
      "Item Code,ROU Value,SOH\nSKU001,2.5,10\n   ,1.0,5\n,0.5,3\n";
    const buf = csvToBuffer(csv);
    const rows = parseRouFile(buf, "test.csv");
    expect(rows.length).toBe(1);
    expect(rows[0].sku).toBe("SKU001");
  });

  it("produces NaN (not 0) for non-numeric rou/soh values", () => {
    const csv = "Item Code,ROU Value,SOH\nSKU001,N/A,unknown\n";
    const buf = csvToBuffer(csv);
    const rows = parseRouFile(buf, "test.csv");
    expect(rows.length).toBe(1);
    expect(Number.isNaN(rows[0].rou)).toBe(true);
    expect(Number.isNaN(rows[0].soh)).toBe(true);
  });

  it("throws Error containing 'Required headers not found' when headers are missing", () => {
    const csv = "Name,Price,Qty\nWidget,9.99,50\n";
    const buf = csvToBuffer(csv);
    expect(() => parseRouFile(buf, "test.csv")).toThrow(
      "Required headers not found",
    );
  });
});

// --- parseDeadStockFile ---

describe("parseDeadStockFile", () => {
  it("parses standard CSV with canonical headers to DeadStockRow[]", () => {
    const csv =
      "Item Code,Item Description,SOH,Ranged\nSKU001,Paracetamol 500mg,10,checked\nSKU002,Ibuprofen 200mg,5,\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows.length).toBe(2);
    expect(rows[0].sku).toBe("SKU001");
    expect(rows[0].description).toBe("Paracetamol 500mg");
    expect(rows[0].soh).toBe(10);
    expect(rows[0].isRanged).toBe(true);
    expect(rows[1].isRanged).toBe(false);
  });

  it("correctly parses all truthy and falsy isRanged variants", () => {
    const csv =
      "Item Code,SOH,Ranged\nSKU001,10,checked\nSKU002,10,Yes\nSKU003,10,TRUE\nSKU004,10,1\nSKU005,10,y\nSKU006,10,\nSKU007,10,no\nSKU008,10,false\nSKU009,10,0\nSKU010,10,n\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows.length).toBe(10);
    // Truthy variants
    expect(rows[0].isRanged).toBe(true); // "checked"
    expect(rows[1].isRanged).toBe(true); // "Yes"
    expect(rows[2].isRanged).toBe(true); // "TRUE"
    expect(rows[3].isRanged).toBe(true); // "1"
    expect(rows[4].isRanged).toBe(true); // "y"
    // Falsy variants
    expect(rows[5].isRanged).toBe(false); // ""
    expect(rows[6].isRanged).toBe(false); // "no"
    expect(rows[7].isRanged).toBe(false); // "false"
    expect(rows[8].isRanged).toBe(false); // "0"
    expect(rows[9].isRanged).toBe(false); // "n"
  });

  it("defaults isRanged to false for all rows when Ranged column is absent", () => {
    const csv = "Item Code,Item Description,SOH\nSKU001,Paracetamol,10\n";
    const buf = csvToBuffer(csv);
    const rows = parseDeadStockFile(buf, "dead.csv");
    expect(rows.length).toBe(1);
    expect(rows[0].isRanged).toBe(false);
  });

  it("throws Error containing 'Required headers not found' when required headers missing", () => {
    const csv = "Name,Price,Qty\nWidget,9.99,50\n";
    const buf = csvToBuffer(csv);
    expect(() => parseDeadStockFile(buf, "dead.csv")).toThrow(
      "Required headers not found",
    );
  });
});
