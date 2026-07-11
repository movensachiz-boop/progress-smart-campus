// Render each page of a PDF file to a JPEG data URL using pdfjs-dist.
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - Vite worker import
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

(pdfjsLib as any).GlobalWorkerOptions.workerPort = new PdfWorker();

export async function pdfFileToImages(file: File, scale = 2): Promise<string[]> {
  const buf = await file.arrayBuffer();
  const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return out;
}
