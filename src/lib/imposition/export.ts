import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { ImpositionConfig, ImpositionPlan, Placement } from "./types";

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



  const surfaces: { placements: Placement[]; label: string }[] = [];
  for (const sheet of plan.sheets) {
    surfaces.push({ placements: sheet.front, label: `${sheet.id} front` });
    surfaces.push({ placements: sheet.back, label: `${sheet.id} back` });
  }

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
      if (cfg.cropMarks) drawCropMarks(page, pl);
      if (cfg.pageLabels) {
        page.drawText(String(pl.logicalNumber), {
          x: pl.x + 4,
          y: pl.y + 4,
          size: 7,
          color: rgb(0.6, 0.6, 0.6),
        });
      }
    }
    if (cfg.foldMarks) drawFoldMarks(page, plan, cfg);
    if (cfg.slug) {
      page.drawText(`${cfg.slug} — ${surface.label}`, {
        x: 8,
        y: 6,
        size: 6,
        color: rgb(0.45, 0.45, 0.45),
      });
    }
    done++;
    onProgress?.(done, surfaces.length);
    if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return out.save();
}

type AnyPage = ReturnType<PDFDocument["addPage"]>;

function drawCropMarks(page: AnyPage, pl: Placement) {
  const len = 8;
  const off = 3;
  const c = rgb(0.35, 0.35, 0.35);
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

function drawFoldMarks(page: AnyPage, plan: ImpositionPlan, cfg: ImpositionConfig) {
  const c = rgb(0.7, 0.7, 0.7);
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

