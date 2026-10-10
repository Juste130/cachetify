"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

// Wide enough to stay sharp at typical zoom levels on a retina display, scaled back down to
// the sheet's actual on-screen width (max-w-[800px]) by the canvas's own CSS sizing below.
const TARGET_PAGE_WIDTH = 900;

function PdfPage({ pdfDoc, pageNumber }: { pdfDoc: PDFDocumentProxy; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    (async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (TARGET_PAGE_WIDTH * dpr) / baseViewport.width });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [pdfDoc, pageNumber]);

  return (
    <div className="max-w-[800px] mx-auto mb-6">
      <div className="bg-white shadow-xl rounded-sm border border-gray-200 overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-auto block" />
      </div>
      <p className="text-center text-[10px] text-gray-400 mt-1">Page {pageNumber}</p>
    </div>
  );
}

interface PdfDocumentViewerProps {
  /** A locally-selected file not yet uploaded anywhere (e.g. the import step, before submit). */
  file?: File | Blob;
  /** An already-hosted document, fetched with credentials (this app's own authenticated proxy). */
  url?: string;
  /** Where the "open the document" fallback link points if rendering fails entirely. */
  fallbackUrl?: string;
  className?: string;
}

/**
 * Renders a PDF as a stack of full-page images via pdf.js, styled as paper sheets — the same
 * visual language as an AI-generated contract's own preview — instead of handing the file to
 * the browser's native PDF plugin (<object>/<iframe>).
 *
 * Deliberate: the native plugin comes with its own download/print toolbar, entirely outside
 * this app's control — for an imported contract, that let anyone pull the raw, uncertified
 * file straight out of the "preview", bypassing the certified PDF (with its verification QR
 * code) that's meant to be the only way to get a copy. A <canvas> has no such built-in escape
 * hatch: what this component draws is pixels, never the file's own bytes.
 */
export function PdfDocumentViewer({ file, url, fallbackUrl, className }: PdfDocumentViewerProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    if (!file && !url) return;
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    setStatus("loading");
    setPdfDoc(null);
    setNumPages(0);

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const data = file
          ? await file.arrayBuffer()
          : await fetch(url!, { credentials: "include" }).then((res) => {
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              return res.arrayBuffer();
            });
        if (cancelled) return;

        doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy();
    };
  }, [file, url]);

  if (status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-gray-100 p-8 text-center ${className || ""}`}>
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground max-w-sm">
          L'aperçu n'a pas pu être généré directement ici. Le document reste accessible en l'ouvrant directement.
        </p>
        {fallbackUrl && (
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline inline-flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir le document
          </a>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-gray-100 overflow-y-auto p-6 ${className || ""}`}>
      {status === "loading" && (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin" /> Génération de l'aperçu...
        </div>
      )}
      {pdfDoc && Array.from({ length: numPages }, (_, i) => (
        <PdfPage key={i} pdfDoc={pdfDoc} pageNumber={i + 1} />
      ))}
    </div>
  );
}
