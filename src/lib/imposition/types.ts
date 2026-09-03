// Canonical imposition data model.
// Document -> Logical Pages -> Signatures -> Physical Sheets -> Surfaces -> Placements

export type Unit = "mm" | "cm" | "in" | "pt";

export const UNIT_TO_PT: Record<Unit, number> = {
  pt: 1,
  mm: 72 / 25.4,
  cm: 720 / 25.4,
  in: 72,
};

export interface LogicalPage {
  sourceDocId: string;
  sourcePageIndex: number | null; // null = blank padding page
  logicalNumber: number;
  width: number; // pt
  height: number; // pt
  rotation: number;
  isBlank: boolean;
}

export interface Placement {
  logicalNumber: number;
  sourcePageIndex: number | null;
  sheetId: string;
  signatureIndex: number;
  side: "front" | "back";
  x: number; // pt, from bottom-left of press sheet
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number; // degrees
  cell: { row: number; col: number };
  creepShift: number;
}

export interface FoldOp {
  axis: "x" | "y";
  order: number;
}

export interface SheetPlan {
  id: string;
  signatureIndex: number;
  sheetIndexInSignature: number;
  front: Placement[];
  back: Placement[];
}

export interface ImpositionPlan {
  sheetWidth: number;
  sheetHeight: number;
  cols: number;
  rows: number;
  sheets: SheetPlan[];
  signatures: { index: number; firstPage: number; lastPage: number; sheets: number }[];
  totalLogicalPages: number;
  paddedPages: number;
  foldSequence: FoldOp[];
  leafOrder: number[];
  warnings: string[];
}

export type NupOrder = "sequential" | "cutstack" | "repeat";

export interface MarkColors {
  crop: string;
  fold: string;
  label: string;
  slug: string;
  registration: string;
}

export interface ImpositionConfig {
  mode: "saddle" | "perfect" | "nup";
  pagesPerSignature: number; // 4,8,...
  nupCols: number;
  nupRows: number;
  sheetWidth: number; // pt
  sheetHeight: number; // pt
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  gutterX: number;
  gutterY: number;
  bindingGutter: number;
  bleed: number;
  creep: number; // pt per sheet
  duplex: "long" | "short";
  scaleMode: "fit" | "fill" | "none";
  cropMarks: boolean;
  foldMarks: boolean;
  registration: boolean;
  pageLabels: boolean;
  slug: string;
  /** Put the cover surface (last|first page) on the front of sheet 1. */
  coverFirst: boolean;
  /** N-up only: how source pages walk the grid. */
  nupOrder: NupOrder;
  /** Print one side only (backs are still planned, just not exported). */
  singleSided: boolean;
  /** Stepped spine marks so gathered signatures can be checked at a glance. */
  collationMarks: boolean;
  colors: MarkColors;
}

export const MARK_PALETTES: Record<string, MarkColors> = {
  Registration: {
    crop: "#000000",
    fold: "#7a7a7a",
    label: "#8a8a8a",
    slug: "#6e6e6e",
    registration: "#000000",
  },
  Cyan: {
    crop: "#0a7ea4",
    fold: "#37b6d9",
    label: "#0a7ea4",
    slug: "#0a7ea4",
    registration: "#0a7ea4",
  },
  Magenta: {
    crop: "#c2185b",
    fold: "#e07bab",
    label: "#c2185b",
    slug: "#c2185b",
    registration: "#c2185b",
  },
  Amber: {
    crop: "#b26a00",
    fold: "#e0a44b",
    label: "#b26a00",
    slug: "#b26a00",
    registration: "#b26a00",
  },
  Blueprint: {
    crop: "#1d3f8f",
    fold: "#5b7fd4",
    label: "#1d3f8f",
    slug: "#1d3f8f",
    registration: "#1d3f8f",
  },
};

export const defaultConfig: ImpositionConfig = {
  mode: "saddle",
  pagesPerSignature: 16,
  nupCols: 2,
  nupRows: 1,
  sheetWidth: 842,
  sheetHeight: 595,
  marginTop: 14,
  marginBottom: 14,
  marginLeft: 14,
  marginRight: 14,
  gutterX: 0,
  gutterY: 0,
  bindingGutter: 0,
  bleed: 0,
  creep: 0,
  duplex: "long",
  scaleMode: "fit",
  cropMarks: true,
  foldMarks: true,
  registration: false,
  pageLabels: false,
  slug: "",
  coverFirst: true,
  nupOrder: "sequential",
  singleSided: false,
  collationMarks: false,
  colors: MARK_PALETTES["Registration"]!,
};

export const PAPER_PRESETS: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  A2: [1190.55, 1683.78],
  A5: [419.53, 595.28],
  Letter: [612, 792],
  Legal: [612, 1008],
  Tabloid: [792, 1224],
  SRA3: [907.09, 1275.59],
};

/**
 * On-the-spot correction. Runs after every edit and pulls the configuration
 * back into a physically printable state, reporting what it had to change.
 */
export function correctConfig(cfg: ImpositionConfig): {
  cfg: ImpositionConfig;
  notes: string[];
} {
  const notes: string[] = [];
  const next = { ...cfg };
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  for (const k of [
    "marginTop",
    "marginBottom",
    "marginLeft",
    "marginRight",
    "gutterX",
    "gutterY",
    "bindingGutter",
    "bleed",
    "creep",
  ] as const) {
    if (!Number.isFinite(next[k]) || next[k] < 0) {
      next[k] = 0;
      notes.push(`${k} cannot be negative — reset to 0.`);
    }
  }

  next.sheetWidth = clamp(next.sheetWidth || 842, 72, 14400);
  next.sheetHeight = clamp(next.sheetHeight || 595, 72, 14400);

  // Margins may never consume the whole sheet.
  const hMargin = next.marginLeft + next.marginRight;
  if (hMargin > next.sheetWidth * 0.8) {
    const each = (next.sheetWidth * 0.8) / 2;
    next.marginLeft = each;
    next.marginRight = each;
    notes.push("Side margins exceeded the sheet — trimmed to 40% each.");
  }
  const vMargin = next.marginTop + next.marginBottom;
  if (vMargin > next.sheetHeight * 0.8) {
    const each = (next.sheetHeight * 0.8) / 2;
    next.marginTop = each;
    next.marginBottom = each;
    notes.push("Top/bottom margins exceeded the sheet — trimmed to 40% each.");
  }

  const cols = Math.max(1, Math.round(next.nupCols));
  const rows = Math.max(1, Math.round(next.nupRows));
  next.nupCols = cols;
  next.nupRows = rows;

  if (next.mode !== "nup") {
    // Folded work needs power-of-two grids and a signature that fills whole sheets.
    const pow2 = (n: number) => 2 ** Math.max(0, Math.round(Math.log2(n)));
    if (!isPow2(cols) || !isPow2(rows)) {
      next.nupCols = pow2(cols);
      next.nupRows = pow2(rows);
      notes.push(
        `Folded signatures need power-of-two grids — snapped to ${next.nupCols} x ${next.nupRows}.`,
      );
    }
    const perSheet = next.nupCols * next.nupRows * 2;
    if (next.pagesPerSignature % perSheet !== 0) {
      next.pagesPerSignature = Math.max(
        perSheet,
        Math.round(next.pagesPerSignature / perSheet) * perSheet,
      );
      notes.push(`Signature rounded to ${next.pagesPerSignature} pages to fill whole sheets.`);
    }
    if (next.singleSided) {
      next.singleSided = false;
      notes.push("Folded work is inherently double-sided — single-sided turned off.");
    }
  }

  if (next.mode !== "saddle" && next.creep > 0) {
    next.creep = 0;
    notes.push("Creep only applies to saddle-stitched work — set to 0.");
  }

  return { cfg: next, notes };
}

function isPow2(n: number) {
  return n > 0 && (n & (n - 1)) === 0;
}
