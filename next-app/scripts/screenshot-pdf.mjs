/**
 * Render a report PDF page-by-page to PNG so the layout can be eyeballed.
 *
 *   node scripts/screenshot-pdf.mjs reports/_smoke-admin.pdf reports/_shots/admin 1.5
 */
import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";

const [pdfPath, outDir, scaleArg] = process.argv.slice(2);
if (!pdfPath || !outDir) {
  console.error("usage: node scripts/screenshot-pdf.mjs <file.pdf> <out-dir> [scale]");
  process.exit(1);
}

const scale = Number(scaleArg ?? 1.5);
fs.mkdirSync(outDir, { recursive: true });

const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(pdfPath)) });
try {
  const result = await parser.getScreenshot({ scale, imageDataUrl: false, imageBuffer: true });
  for (const page of result.pages) {
    const file = path.join(outDir, `page-${String(page.pageNumber).padStart(2, "0")}.png`);
    fs.writeFileSync(file, page.data);
    console.log(`${file}  ${page.width}x${page.height}`);
  }
  console.log(`${result.total} page(s) -> ${outDir}`);
} finally {
  await parser.destroy();
}
