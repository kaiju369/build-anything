// Generalized folding engine.
//
// A physical sheet is divided into a grid of 2^a columns x 2^b rows.
// Each grid cell carries one leaf (a front surface and a back surface).
// A fold is a geometric transformation: one half of the sheet is reflected
// onto the other half, reversing the stacking order of the moved leaves and
// flipping their orientation.
//
// Applying the full fold sequence collapses the grid to a single stack.
// The resulting stack order tells us exactly where every leaf ends up, which
// is what lets us assign logical page numbers without hard-coded tables.

import type { FoldOp } from "./types";

export interface Leaf {
  row: number;
  col: number;
  flipX: boolean;
  flipY: boolean;
  /** true when the physical front of the sheet faces up in the folded stack */
  frontUp: boolean;
}

export interface FoldState {
  cols: number;
  rows: number;
  /** grid[row][col] = stack of leaves, index 0 = top */
  grid: Leaf[][][];
}

export function createSheet(cols: number, rows: number): FoldState {
  const grid: Leaf[][][] = [];
  for (let r = 0; r < rows; r++) {
    const rowArr: Leaf[][] = [];
    for (let c = 0; c < cols; c++) {
      rowArr.push([{ row: r, col: c, flipX: false, flipY: false, frontUp: true }]);
    }
    grid.push(rowArr);
  }
  return { cols, rows, grid };
}

/** Fold the sheet in half along an axis. Left folds onto right / top onto bottom. */
export function applyFold(state: FoldState, axis: "x" | "y"): FoldState {
  const { cols, rows, grid } = state;
  if (axis === "x") {
    if (cols < 2) return state;
    const half = cols / 2;
    const next: Leaf[][][] = [];
    for (let r = 0; r < rows; r++) {
      const rowArr: Leaf[][] = [];
      for (let c = 0; c < half; c++) {
        const keep = grid[r]![c + half]!;
        const moved = grid[r]![half - 1 - c]!
          .slice()
          .reverse()
          .map((l) => ({ ...l, flipX: !l.flipX, frontUp: !l.frontUp }));
        rowArr.push([...moved, ...keep]);
      }
      next.push(rowArr);
    }
    return { cols: half, rows, grid: next };
  }
  if (rows < 2) return state;
  const half = rows / 2;
  const next: Leaf[][][] = [];
  for (let r = 0; r < half; r++) {
    const rowArr: Leaf[][] = [];
    for (let c = 0; c < cols; c++) {
      const keep = grid[r + half]![c]!;
      const moved = grid[half - 1 - r]![c]!
        .slice()
        .reverse()
        .map((l) => ({ ...l, flipY: !l.flipY, frontUp: !l.frontUp }));
      rowArr.push([...moved, ...keep]);
    }
    next.push(rowArr);
  }
  return { cols, rows: half, grid: next };
}

export function simulate(cols: number, rows: number, sequence: FoldOp[]): Leaf[] {
  let state = createSheet(cols, rows);
  for (const op of sequence) state = applyFold(state, op.axis);
  return state.grid[0]![0]!;
}

/** Derive a fold sequence that collapses a cols x rows grid (powers of two). */
export function deriveFoldSequence(cols: number, rows: number): FoldOp[] {
  const seq: FoldOp[] = [];
  let c = cols;
  let r = rows;
  let order = 0;
  // Alternate folds, always halving the larger remaining dimension first.
  while (c > 1 || r > 1) {
    if (c >= r && c > 1) {
      seq.push({ axis: "x", order: order++ });
      c /= 2;
    } else if (r > 1) {
      seq.push({ axis: "y", order: order++ });
      r /= 2;
    }
  }
  return seq;
}

export function isPowerOfTwo(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}
