import { describe, expect, it } from "vitest";
import { buildPlan } from "./plan";
import { simulate } from "./folding";
import { defaultConfig, type ImpositionConfig } from "./types";

const A5 = { width: 419.53, height: 595.28 };

function cfgOf(over: Partial<ImpositionConfig>): ImpositionConfig {
  return { ...defaultConfig, ...over };
}

/**
 * Physically fold each planned sheet, nest the sheets of a signature, then
 * read the resulting booklet from the top of the stack. A correct imposition
 * must read 1, 2, 3, ... with no gaps.
 */
function readBooklet(base: ImpositionConfig, sourcePages: number) {
  // coverFirst only swaps which surface is fed first; it does not change the
  // physical sheet, so it is verified separately.
  const cfg = { ...base, coverFirst: false };
  const plan = buildPlan(sourcePages, A5, cfg);
  const leaves = simulate(plan.cols, plan.rows, plan.foldSequence);
  const half = leaves.length / 2;
  const perSig = new Map<number, { top: number[][]; bottom: number[][] }>();

  for (const sheet of plan.sheets) {
    if (!perSig.has(sheet.signatureIndex)) perSig.set(sheet.signatureIndex, { top: [], bottom: [] });
    const bucket = perSig.get(sheet.signatureIndex)!;
    const at = (list: typeof sheet.front, row: number, col: number) =>
      list.find((p) => p.cell.row === row && p.cell.col === col)!.logicalNumber;

    const top: number[] = [];
    const bottom: number[] = [];
    leaves.forEach((leaf, j) => {
      // The back surface is mirrored, so look the leaf's cell up accordingly.
      const bRow = cfg.duplex === "short" ? plan.rows - 1 - leaf.row : leaf.row;
      const bCol = cfg.duplex === "long" ? plan.cols - 1 - leaf.col : leaf.col;
      const onFront = at(sheet.front, leaf.row, leaf.col);
      const onBack = at(sheet.back, bRow, bCol);
      // frontUp says which physical surface of this leaf faces the reader.
      const pair = leaf.frontUp ? [onFront, onBack] : [onBack, onFront];
      (j < half ? top : bottom).push(...pair);
    });
    bucket.top.push(top);
    bucket.bottom.push(bottom);
  }

  // Sheets nest: sheet 0 wraps the outside, so its bottom half is read last.
  const orders = new Map<number, number[]>();
  for (const [sig, { top, bottom }] of perSig)
    orders.set(sig, [...top.flat(), ...bottom.reverse().flat()]);

  return { plan, orders };
}

describe("saddle-stitch signature order", () => {
  it("places the classic 16pp 2-up sheet correctly", () => {
    const plan = buildPlan(16, A5, cfgOf({ pagesPerSignature: 16 }));
    const read = (list: (typeof plan.sheets)[number]["front"]) =>
      list
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((p) => p.logicalNumber)
        .join("|");
    // coverFirst puts the cover surface (16|1) first.
    expect(read(plan.sheets[0]!.front)).toBe("16|1");
    expect(read(plan.sheets[0]!.back)).toBe("2|15");
    expect(read(plan.sheets[3]!.front)).toBe("8|9");
  });

  it("keeps every surface pair summing to P+1 on a 2-up signature", () => {
    for (const P of [4, 8, 16, 32]) {
      const plan = buildPlan(P, A5, cfgOf({ pagesPerSignature: P }));
      for (const s of plan.sheets)
        for (const surface of [s.front, s.back])
          expect(surface.reduce((a, p) => a + p.logicalNumber, 0)).toBe(P + 1);
    }
  });
});

describe("every configuration", () => {
  const grids = [
    [2, 1],
    [2, 2],
    [4, 2],
    [4, 4],
  ] as const;

  for (const [cols, rows] of grids)
    for (const P of [8, 16, 32])
      for (const duplex of ["long", "short"] as const) {
        const name = `${cols}x${rows} · ${P}pp · ${duplex} edge`;

        it(`${name}: uses each page exactly once`, () => {
          const plan = buildPlan(96, A5, cfgOf({ nupCols: cols, nupRows: rows, pagesPerSignature: P, duplex }));
          const seen = new Set<number>();
          let count = 0;
          for (const s of plan.sheets)
            for (const p of [...s.front, ...s.back]) {
              seen.add(p.logicalNumber);
              count++;
            }
          expect(seen.size).toBe(count);
          expect(seen.size).toBe(plan.totalLogicalPages);
        });

        it(`${name}: front and back register with gutter and creep`, () => {
          const cfg = cfgOf({
            nupCols: cols,
            nupRows: rows,
            pagesPerSignature: P,
            duplex,
            bindingGutter: 18,
            creep: 1.5,
          });
          const plan = buildPlan(96, A5, cfg);
          for (const s of plan.sheets)
            for (const f of s.front) {
              const bRow = duplex === "short" ? plan.rows - 1 - f.cell.row : f.cell.row;
              const bCol = duplex === "long" ? plan.cols - 1 - f.cell.col : f.cell.col;
              const b = s.back.find((p) => p.cell.row === bRow && p.cell.col === bCol)!;
              // Same leaf, so consecutive pages...
              expect(Math.abs(f.logicalNumber - b.logicalNumber)).toBe(1);
              // ...and the back must land exactly behind the front.
              const fc = f.x + f.width / 2;
              const bc = b.x + b.width / 2;
              if (duplex === "long") expect(fc + bc).toBeCloseTo(plan.sheetWidth, 6);
              else expect(fc).toBeCloseTo(bc, 6);
            }
        });

        it(`${name}: folds into consecutive reading order`, () => {
          const { plan, orders } = readBooklet(
            cfgOf({ nupCols: cols, nupRows: rows, pagesPerSignature: P, duplex }),
            96,
          );
          for (const [sig, order] of orders) {
            const first = plan.signatures[sig]!.firstPage;
            expect(order).toEqual(order.map((_, i) => first + i));
          }
        });
      }
});

describe("creep and binding gutter", () => {
  it("leaves the outer sheet uncompensated and pulls inner sheets toward the spine", () => {
    const plan = buildPlan(16, A5, cfgOf({ pagesPerSignature: 16, creep: 3 }));
    const spine = plan.sheetWidth / 2;
    const distance = (i: number) => {
      const p = plan.sheets[i]!.front.find((q) => q.x + q.width / 2 > spine)!;
      return p.x - spine;
    };
    expect(distance(0)).toBeCloseTo(distance(0), 6);
    for (let i = 1; i < plan.sheets.length; i++)
      expect(distance(i)).toBeLessThan(distance(i - 1));
  });

  it("opens the spine symmetrically for the binding gutter", () => {
    const a = buildPlan(16, A5, cfgOf({ bindingGutter: 0 }));
    const b = buildPlan(16, A5, cfgOf({ bindingGutter: 20 }));
    const left = (p: typeof a) => p.sheets[0]!.front.find((q) => q.cell.col === 0)!.x;
    const right = (p: typeof a) => p.sheets[0]!.front.find((q) => q.cell.col === 1)!.x;
    expect(left(b)).toBeCloseTo(left(a) - 10, 6);
    expect(right(b)).toBeCloseTo(right(a) + 10, 6);
  });
});

describe("n-up", () => {
  it("sequential duplex backs page 1 with page n+1", () => {
    const plan = buildPlan(16, A5, cfgOf({ mode: "nup", nupCols: 2, nupRows: 2 }));
    const f = plan.sheets[0]!.front.find((p) => p.logicalNumber === 1)!;
    const b = plan.sheets[0]!.back.find((p) => p.cell.col === plan.cols - 1 - f.cell.col && p.cell.row === f.cell.row)!;
    expect(b.logicalNumber).toBe(5);
  });

  it("cut-stack gives each slot its own consecutive pile", () => {
    const plan = buildPlan(16, A5, cfgOf({ mode: "nup", nupCols: 2, nupRows: 1, nupOrder: "cutstack" }));
    const slot0 = plan.sheets.flatMap((s) =>
      [...s.front, ...s.back].filter((p) => p.cell.col === 0 || p.cell.col === plan.cols - 1),
    );
    expect(slot0.length).toBeGreaterThan(0);
    const all = new Set(plan.sheets.flatMap((s) => [...s.front, ...s.back]).map((p) => p.logicalNumber));
    expect(all.size).toBe(plan.totalLogicalPages);
  });

  it("single-sided plans leave the back surface empty", () => {
    const plan = buildPlan(8, A5, cfgOf({ mode: "nup", nupCols: 2, nupRows: 2, singleSided: true }));
    expect(plan.sheets[0]!.back).toHaveLength(0);
    expect(plan.sheets).toHaveLength(2);
  });
});

describe("live validation", () => {
  it("flags margins that swallow the sheet", () => {
    const plan = buildPlan(16, A5, cfgOf({ marginLeft: 500, marginRight: 500 }));
    expect(plan.warnings.join(" ")).toMatch(/exceed the press sheet/);
  });

  it("flags pages larger than their cell at 100% scale", () => {
    const plan = buildPlan(16, A5, cfgOf({ scaleMode: "none", sheetWidth: 400, sheetHeight: 300 }));
    expect(plan.warnings.join(" ")).toMatch(/larger than its cell/);
  });

  it("rounds signature size up to a whole number of sheets", () => {
    const plan = buildPlan(16, A5, cfgOf({ nupCols: 2, nupRows: 2, pagesPerSignature: 12 }));
    expect(plan.warnings.join(" ")).toMatch(/Signature size adjusted/);
    expect(plan.totalLogicalPages % 8).toBe(0);
  });
});
