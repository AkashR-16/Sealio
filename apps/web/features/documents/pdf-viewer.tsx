"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import * as pdfjsLib from "pdfjs-dist"
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import { AlertCircle, Loader2 } from "lucide-react"
import { FieldCanvas } from "./field-canvas"
import type { PlacedField } from "./field-canvas"

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

interface PdfViewerProps {
  pdfUrl: string
  scale: number
  fields?: PlacedField[]
  onPageCount?: (count: number) => void
  onFieldPlace?: (field: Omit<PlacedField, "id">) => void
  onFieldMove?: (id: string, x: number, y: number) => void
  onFieldResize?: (id: string, x: number, y: number, width: number, height: number) => void
  onFieldSelect?: (id: string | null) => void
  selectedFieldId?: string | null
  activeFieldType?: string | null
  currentPage: number
  onPageChange?: (page: number) => void
  /** Optional extra overlay rendered on top of each page (used by the signing view) */
  overlayChildren?: (pageNum: number) => React.ReactNode
}

interface RenderedPage {
  pageNum: number
  width: number
  height: number
}

export function PdfViewer({
  pdfUrl,
  scale,
  fields = [],
  onPageCount,
  onFieldPlace,
  onFieldMove,
  onFieldResize,
  onFieldSelect,
  selectedFieldId,
  activeFieldType,
  currentPage,
  onPageChange,
  overlayChildren,
}: PdfViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [renderedPages, setRenderedPages] = useState<RenderedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const renderingRef = useRef<Set<number>>(new Set())

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPdf(null)
    setRenderedPages([])

    pdfjsLib
      .getDocument({ url: pdfUrl, cMapUrl: "/cmaps/", cMapPacked: true })
      .promise.then((doc) => {
        if (cancelled) return
        setPdf(doc)
        onPageCount?.(doc.numPages)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? "Failed to load PDF")
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pdfUrl, onPageCount])

  // Destroy PDF document when URL changes to prevent memory leak
  useEffect(() => {
    return () => {
      setPdf((prev) => {
        prev?.destroy()
        return null
      })
    }
  }, [pdfUrl])

  // Render a single page onto its canvas
  const renderPage = useCallback(
    async (pageProxy: PDFPageProxy, pageNum: number) => {
      if (renderingRef.current.has(pageNum)) return
      const canvas = canvasRefs.current.get(pageNum)
      if (!canvas) return

      renderingRef.current.add(pageNum)
      const viewport = pageProxy.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      try {
        await pageProxy.render({ canvasContext: ctx, canvas, viewport }).promise
        setRenderedPages((prev) => {
          if (prev.find((p) => p.pageNum === pageNum)) return prev
          return [...prev, { pageNum, width: viewport.width, height: viewport.height }]
        })
      } finally {
        renderingRef.current.delete(pageNum)
      }
    },
    [scale],
  )

  // Track which page is most visible and report it via onPageChange.
  // Runs whenever pages finish rendering (renderedPages changes).
  useEffect(() => {
    if (!onPageChange || !pdf) return

    const ratios = new Map<number, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const n = parseInt(entry.target.id.replace("pdf-page-", ""))
          if (!isNaN(n)) ratios.set(n, entry.intersectionRatio)
        })

        let bestPage = 1
        let bestRatio = -1
        ratios.forEach((ratio, page) => {
          if (ratio > bestRatio) { bestRatio = ratio; bestPage = page }
        })

        if (bestRatio > 0) onPageChange(bestPage)
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )

    for (let i = 1; i <= pdf.numPages; i++) {
      const el = document.getElementById(`pdf-page-${i}`)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [pdf, renderedPages, onPageChange])

  // Re-render all pages when PDF loads or scale changes
  useEffect(() => {
    if (!pdf) return
    setRenderedPages([])
    renderingRef.current.clear()

    const render = async () => {
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        await renderPage(page, i)
      }
    }
    render()
  }, [pdf, renderPage])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-foreground-muted">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-sm">Loading document…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-error">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!pdf) return null

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4">
      {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((pageNum) => {
        const rendered = renderedPages.find((p) => p.pageNum === pageNum)
        const pageFields = fields.filter((f) => f.page === pageNum)

        return (
          <div
            key={pageNum}
            id={`pdf-page-${pageNum}`}
            className="relative shadow-xl rounded-sm"
            style={{ scrollMarginTop: "80px" }}
          >
            {/* Page number label */}
            <div className="absolute -top-6 left-0 text-xs text-foreground-subtle select-none">
              Page {pageNum}
            </div>

            {/* PDF canvas */}
            <canvas
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el)
                else canvasRefs.current.delete(pageNum)
              }}
              className="block"
            />

            {/* Field canvas overlay — shown once page is rendered */}
            {rendered && (
              <FieldCanvas
                pageNum={pageNum}
                width={rendered.width}
                height={rendered.height}
                fields={pageFields}
                activeFieldType={activeFieldType ?? null}
                selectedFieldId={selectedFieldId ?? null}
                onPlace={(field) => onFieldPlace?.(field)}
                onMove={(id, x, y) => onFieldMove?.(id, x, y)}
                onResize={(id, x, y, w, h) => onFieldResize?.(id, x, y, w, h)}
                onSelect={(id) => onFieldSelect?.(id)}
              />
            )}

            {/* Signing overlay (e.g. field buttons for signers) */}
            {rendered && overlayChildren?.(pageNum)}

            {/* Loading shimmer while rendering */}
            {!rendered && (
              <div
                className="absolute inset-0 bg-surface animate-pulse rounded-sm"
                style={{ minWidth: 600, minHeight: 800 }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
