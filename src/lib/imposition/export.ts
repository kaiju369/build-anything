import { PDFDocument, degrees, rgb, type RGB } from "pdf-lib";
import type { ImpositionConfig, ImpositionPlan, Placement } from "./types";

/** "#rrggbb" -> pdf-lib rgb(). Falls back to mid grey for anything unparseable. */
export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return rgb(0.4, 0.4, 0.4);
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function exportImposedPdf(
  sourceBytes: ArrayBuffer,
  plan: ImpositionPlan,
  cfg: ImpositionConfig,
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array> {
  const src = await PDFDocument.load(sourceBytes);
  const out = await PDFDocument.create();
  const srcCount = src.getPageCount();

  const needed = new Set<number>();
  for (const sheet of plan.sheets)
    for (const p of [...sheet.front, ...sheet.back])
      if (p.logicalNumber <= srcCount) needed.add(p.logicalNumber - 1);

  const indices = [...needed].sort((a, b) => a - b);
  type Embedded = Awaited<ReturnType<PDFDocument["embedPdf"]>>[number];
  const byIndex = new Map<number, Embedded>();
  for (const idx of indices) {
    try {
      // Skip pages with no content stream: pdf-lib cannot embed them and would
      // otherwise abort the whole export at save time.
      if (!src.getPage(idx).node.Contents()) continue;
      const [emb] = await out.embedPdf(src, [idx]);
      if (emb) byIndex.set(idx, emb);
    } catch {
      // leave the cell blank
    }
  }

  const cCrop = hexToRgb(cfg.colors.crop);
  const cFold = hexToRgb(cfg.colors.fold);
  const cLabel = hexToRgb(cfg.colors.label);
  const cSlug = hexToRgb(cfg.colors.slug);
  const cReg = hexToRgb(cfg.colors.registration);

  const surfaces: { placements: Placement[]; label: string; sheet: number }[] = [];
  plan.sheets.forEach((sheet, i) => {
    surfaces.push({ placements: sheet.front, label: `${sheet.id} front`, sheet: i });
    if (!cfg.singleSided && sheet.back.length)
      surfaces.push({ placements: sheet.back, label: `${sheet.id} back`, sheet: i });
  });

  let done = 0;
  for (const surface of surfaces) {
    const page = out.addPage([plan.sheetWidth, plan.sheetHeight]);
    for (const pl of surface.placements) {
      const emb = byIndex.get(pl.logicalNumber - 1);
      if (emb) {
        if (pl.rotation === 180) {
          page.drawPage(emb, {
            x: pl.x + pl.width,
            y: pl.y + pl.height,
            xScale: pl.scale,
            yScale: pl.scale,
            rotate: degrees(180),
          });
        } else {
          page.drawPage(emb, {
            x: pl.x,
            y: pl.y,
            xScale: pl.scale,
            yScale: pl.scale,
          });
        }
      }
      if (cfg.cropMarks) drawCropMarks(page, pl, cfg.bleed, cCrop);
      if (cfg.pageLabels) {
        page.drawText(String(pl.logicalNumber), {
          x: pl.x + 4,
          y: pl.y + 4,
          size: 7,
          color: cLabel,
        });
      }
    }
    if (cfg.foldMarks) drawFoldMarks(page, plan, cfg, cFold);
    if (cfg.registration) drawRegistrationTargets(page, plan, cReg);
    if (cfg.collationMarks) drawCollationMark(page, plan, surface.sheet, cReg);
    if (cfg.slug) {
      page.drawText(`${cfg.slug} — ${surface.label}`, {
        x: 8,
        y: 6,
        size: 6,
        color: cSlug,
      });
    }
    done++;
    onProgress?.(done, surfaces.length);
    if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return out.save();
}

type AnyPage = ReturnType<PDFDocument["addPage"]>;

function drawCropMarks(page: AnyPage, pl: Placement, bleed: number, c: RGB) {
  const len = 8;
  const off = 3 + bleed;
  const corners = [
    [pl.x, pl.y],
    [pl.x + pl.width, pl.y],
    [pl.x, pl.y + pl.height],
    [pl.x + pl.width, pl.y + pl.height],
  ] as const;
  for (const [cx, cy] of corners) {
    const dx = cx === pl.x ? -1 : 1;
    const dy = cy === pl.y ? -1 : 1;
    page.drawLine({
      start: { x: cx + dx * off, y: cy },
      end: { x: cx + dx * (off + len), y: cy },
      thickness: 0.35,
      color: c,
    });
    page.drawLine({
      start: { x: cx, y: cy + dy * off },
      end: { x: cx, y: cy + dy * (off + len) },
      thickness: 0.35,
      color: c,
    });
  }
}

function drawFoldMarks(page: AnyPage, plan: ImpositionPlan, cfg: ImpositionConfig, c: RGB) {
  const liveW = cfg.sheetWidth - cfg.marginLeft - cfg.marginRight;
  const liveH = cfg.sheetHeight - cfg.marginTop - cfg.marginBottom;
  for (let i = 1; i < plan.cols; i++) {
    const x = cfg.marginLeft + (liveW / plan.cols) * i;
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: 6 },
      thickness: 0.3,
      color: c,
      dashArray: [2, 2],
    });
    page.drawLine({
      start: { x, y: cfg.sheetHeight - 6 },
      end: { x, y: cfg.sheetHeight },
      thickness: 0.3,
      color: c,
      dashArray: [2, 2],
    });
  }
  for (let i = 1; i < plan.rows; i++) {
    const y = cfg.marginBottom + (liveH / plan.rows) * i;
    page.drawLine({
      start: { x: 0, y },
      end: { x: 6, y },
      thickness: 0.3,
      color: c,
      dashArray: [2, 2],
    });
    page.drawLine({
      start: { x: cfg.sheetWidth - 6, y },
      end: { x: cfg.sheetWidth, y },
      thickness: 0.3,
      color: c,
      dashArray: [2, 2],
    });
  }
}

/** Cross-in-circle targets on all four edges, used to check press register. */
function drawRegistrationTargets(page: AnyPage, plan: ImpositionPlan, c: RGB) {
  const r = 4.5;
  const spots = [
    [plan.sheetWidth / 2, 9],
    [plan.sheetWidth / 2, plan.sheetHeight - 9],
    [9, plan.sheetHeight / 2],
    [plan.sheetWidth - 9, plan.sheetHeight / 2],
  ] as const;
  for (const [x, y] of spots) {
    page.drawCircle({ x, y, size: r, borderWidth: 0.35, borderColor: c });
    page.drawLine({
      start: { x: x - r - 2, y },
      end: { x: x + r + 2, y },
      thickness: 0.35,
      color: c,
    });
    page.drawLine({
      start: { x, y: y - r - 2 },
      end: { x, y: y + r + 2 },
      thickness: 0.35,
      color: c,
    });
  }
}

/**
 * A stepped black bar on the spine edge. Once the signatures are gathered the
 * bars form a descending staircase, so a misgathered book is obvious.
 */
function drawCollationMark(page: AnyPage, plan: ImpositionPlan, sheetIndex: number, c: RGB) {
  const total = Math.max(1, plan.sheets.length);
  const barH = Math.min(18, (plan.sheetHeight - 24) / total);
  const y = plan.sheetHeight - 12 - barH * (sheetIndex % total) - barH;
  page.drawRectangle({
    x: plan.sheetWidth / 2 - 2.5,
    y,
    width: 5,
    height: barH * 0.7,
    color: c,
  });
}
