import { deriveFoldSequence, isPowerOfTwo, simulate } from "./folding";
import type { ImpositionConfig, ImpositionPlan, Placement, SheetPlan } from "./types";

export interface SourcePageSize {
  width: number;
  height: number;
}

interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  col: number;
}

function buildGrid(cfg: ImpositionConfig, cols: number, rows: number): CellRect[] {
  const usableW =
    cfg.sheetWidth - cfg.marginLeft - cfg.marginRight - cfg.gutterX * (cols - 1);
  const usableH =
    cfg.sheetHeight - cfg.marginTop - cfg.marginBottom - cfg.gutterY * (rows - 1);
  const cw = usableW / cols;
  const ch = usableH / rows;
  const cells: CellRect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        // y measured from bottom; row 0 is the top row
        x: cfg.marginLeft + c * (cw + cfg.gutterX),
        y: cfg.marginBottom + (rows - 1 - r) * (ch + cfg.gutterY),
        w: cw,
        h: ch,
        row: r,
        col: c,
      });
    }
  }
  return cells;
}

function fitPage(
  cell: CellRect,
  page: SourcePageSize,
  rotation: number,
  cfg: ImpositionConfig,
): { x: number; y: number; w: number; h: number; scale: number } {
  const rotated = rotation % 180 !== 0;
  const pw = rotated ? page.height : page.width;
  const ph = rotated ? page.width : page.height;
  let scale = 1;
  if (cfg.scaleMode === "fit") scale = Math.min(cell.w / pw, cell.h / ph);
  else if (cfg.scaleMode === "fill") scale = Math.max(cell.w / pw, cell.h / ph);
  const w = pw * scale;
  const h = ph * scale;
  return {
    x: cell.x + (cell.w - w) / 2,
    y: cell.y + (cell.h - h) / 2,
    w,
    h,
    scale,
  };
}

export function buildPlan(
  totalSourcePages: number,
  pageSize: SourcePageSize,
  cfg: ImpositionConfig,
): ImpositionPlan {
  const warnings: string[] = [];
  const cols = Math.max(1, Math.floor(cfg.nupCols));
  const rows = Math.max(1, Math.floor(cfg.nupRows));
  const cells = buildGrid(cfg, cols, rows);
  const perSide = cols * rows;

  if (cfg.mode === "nup") {
    return buildNupPlan(totalSourcePages, pageSize, cfg, cells, cols, rows, warnings);
  }

  if (!isPowerOfTwo(cols) || !isPowerOfTwo(rows)) {
    warnings.push(
      "Folded signatures require power-of-two grids; falling back to a 2 x 1 layout.",
    );
    return buildPlan(totalSourcePages, pageSize, {
      ...cfg,
      nupCols: 2,
      nupRows: 1,
    });
  }

  const pagesPerSheet = perSide * 2;
  let P = cfg.pagesPerSignature;
  if (P % pagesPerSheet !== 0) {
    P = Math.max(pagesPerSheet, Math.round(P / pagesPerSheet) * pagesPerSheet);
    warnings.push(
      `Signature size adjusted to ${P} pages so it divides evenly into ${pagesPerSheet}-page sheets.`,
    );
  }
  const sheetsPerSignature = P / pagesPerSheet;

  const totalPages = Math.ceil(totalSourcePages / P) * P;
  const padded = totalPages - totalSourcePages;
  const signatureCount = totalPages / P;

  const foldSequence = deriveFoldSequence(cols, rows);
  const leaves = simulate(cols, rows, foldSequence);
  const L = leaves.length; // leaves per folded sheet
  const half = L / 2;
  const leavesPerSignature = P / 2;

  const sheets: SheetPlan[] = [];
  for (let sig = 0; sig < signatureCount; sig++) {
    const sigFirst = sig * P + 1;
    for (let s = 0; s < sheetsPerSignature; s++) {
      const front: Placement[] = [];
      const back: Placement[] = [];
      // Sheet 0 is the outermost wrap and needs no compensation; each sheet
      // nested inside it is pushed toward the spine by one creep step.
      const creepShift = cfg.mode === "saddle" ? cfg.creep * s : 0;

      leaves.forEach((leaf, j) => {
        const globalLeaf =
          j < half
            ? s * half + j
            : leavesPerSignature - (s + 1) * half + (j - half);
        const rectoPage = sigFirst + globalLeaf * 2;
        const versoPage = rectoPage + 1;
        const rotation = leaf.flipY ? 180 : 0;
        const cell = cells.find((c) => c.row === leaf.row && c.col === leaf.col)!;

        const upPage = leaf.frontUp ? rectoPage : versoPage;
        const downPage = leaf.frontUp ? versoPage : rectoPage;

        front.push(
          makePlacement(upPage, cell, pageSize, rotation, cfg, sig, "front", s, creepShift, cols),
        );
        back.push(
          makePlacement(
            downPage,
            mirrorCell(cell, cfg, cols, rows),
            pageSize,
            rotation,
            cfg,
            sig,
            "back",
            s,
            creepShift,
            cols,
          ),
        );
      });

      // Press convention: the surface carrying the first page of the
      // signature (the cover on sheet 1) runs first. Swapping the two
      // surfaces keeps registration intact — the same physical sheet is
      // simply fed the other way round.
      const coverOnBack =
        cfg.coverFirst && back.some((p) => p.logicalNumber === sigFirst);
      const surfaceA = coverOnBack ? relabel(back, "front") : front;
      const surfaceB = coverOnBack ? relabel(front, "back") : back;

      sheets.push({
        id: `S${sig + 1}-${s + 1}`,
        signatureIndex: sig,
        sheetIndexInSignature: s,
        front: surfaceA,
        back: surfaceB,
      });
    }
  }

  return {
    sheetWidth: cfg.sheetWidth,
    sheetHeight: cfg.sheetHeight,
    cols,
    rows,
    sheets,
    signatures: Array.from({ length: signatureCount }, (_, i) => ({
      index: i,
      firstPage: i * P + 1,
      lastPage: (i + 1) * P,
      sheets: sheetsPerSignature,
    })),
    totalLogicalPages: totalPages,
    paddedPages: padded,
    foldSequence,
    leafOrder: leaves.map((l) => l.row * cols + l.col),
    warnings,
  };
}

function mirrorCell(
  cell: CellRect,
  cfg: ImpositionConfig,
  cols: number,
  rows: number,
): CellRect {
  if (cfg.duplex === "long") {
    return {
      ...cell,
      x: cfg.sheetWidth - cell.x - cell.w,
      col: cols - 1 - cell.col,
    };
  }
  return {
    ...cell,
    y: cfg.sheetHeight - cell.y - cell.h,
    row: rows - 1 - cell.row,
  };
}

function makePlacement(
  logicalNumber: number,
  cell: CellRect,
  pageSize: SourcePageSize,
  rotation: number,
  cfg: ImpositionConfig,
  signatureIndex: number,
  side: "front" | "back",
  sheetIndexInSignature: number,
  creepShift: number,
  cols: number,
): Placement {
  const fitted = fitPage(cell, pageSize, rotation, cfg);
  // The cell passed in for a back surface is already mirrored, so its own
  // position relative to the spine gives the correct sign. Negating again
  // would throw front and back out of register.
  const towardOuter = cell.col < cols / 2 ? -1 : 1;
  // Binding gutter opens the spine; creep pulls nested sheets back toward it.
  const bindingOffset = (cfg.bindingGutter / 2) * towardOuter - creepShift * towardOuter;
  return {
    logicalNumber,
    sourcePageIndex: logicalNumber - 1,
    sheetId: `S${signatureIndex + 1}-${sheetIndexInSignature + 1}`,
    signatureIndex,
    side,
    x: fitted.x + bindingOffset,
    y: fitted.y,
    width: fitted.w,
    height: fitted.h,
    scale: fitted.scale,
    rotation,
    cell: { row: cell.row, col: cell.col },
    creepShift,
  };
}

function buildNupPlan(
  totalSourcePages: number,
  pageSize: SourcePageSize,
  cfg: ImpositionConfig,
  cells: CellRect[],
  cols: number,
  rows: number,
  warnings: string[],
): ImpositionPlan {
  const perSide = cols * rows;
  const perSheet = cfg.singleSided ? perSide : perSide * 2;
  const totalPages = Math.ceil(totalSourcePages / perSheet) * perSheet;
  const sheetCount = totalPages / perSheet;
  const sheets: SheetPlan[] = [];

  // How a source page number maps onto (sheet, surface slot).
  // sequential : reading order down the stack, cut nothing
  // cutstack   : slice the job into N piles; slot i takes its own pile, so
  //              guillotining the stack once gives collated booklets
  // repeat     : the same page fills every slot (business cards, labels)
  const pageFor = (s: number, slot: number, surface: number) => {
    const slotsPerSheet = cfg.singleSided ? perSide : perSide * 2;
    if (cfg.nupOrder === "repeat") return s + 1;
    if (cfg.nupOrder === "cutstack") {
      const perPile = totalPages / perSide;
      const withinPile = s * (cfg.singleSided ? 1 : 2) + surface;
      return slot * perPile + withinPile + 1;
    }
    return s * slotsPerSheet + surface * perSide + slot + 1;
  };

  for (let s = 0; s < sheetCount; s++) {
    const front: Placement[] = [];
    const back: Placement[] = [];
    cells.forEach((cell, i) => {
      front.push(
        makePlacement(pageFor(s, i, 0), cell, pageSize, 0, cfg, 0, "front", s, 0, cols),
      );
    });
    if (!cfg.singleSided) {
      cells.forEach((cell, i) => {
        back.push(
          makePlacement(
            pageFor(s, i, 1),
            mirrorCell(cell, cfg, cols, rows),
            pageSize,
            0,
            cfg,
            0,
            "back",
            s,
            0,
            cols,
          ),
        );
      });
    }
    sheets.push({ id: `N-${s + 1}`, signatureIndex: 0, sheetIndexInSignature: s, front, back });
  }
  if (cfg.nupOrder === "repeat")
    warnings.push("Repeat mode duplicates one source page across every slot on a sheet.");
  return {
    sheetWidth: cfg.sheetWidth,
    sheetHeight: cfg.sheetHeight,
    cols,
    rows,
    sheets,
    signatures: [
      { index: 0, firstPage: 1, lastPage: totalPages, sheets: sheetCount },
    ],
    totalLogicalPages: totalPages,
    paddedPages: totalPages - totalSourcePages,
    foldSequence: [],
    leafOrder: [],
    warnings,
  };
}
