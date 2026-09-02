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
