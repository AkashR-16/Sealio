"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { ArrowLeft, ZoomIn, ZoomOut, Save, Loader2, Check, Send, FileText, Plus, X, ChevronLeft, ChevronRight, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "@/lib/toast"
import { useDocument, useDocumentPdfUrl, useDocumentFields, useSaveFields, useDetectFields, useSendDocument } from "./queries"
import { SignerPanel, SIGNER_COLORS } from "./signer-panel"
import type { Signer } from "./signer-panel"
import type { PlacedField } from "./field-canvas"

const PdfViewer = dynamic(
  () => import("./pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false, loading: () => <div className="flex-1 bg-surface-raised animate-pulse" /> },
)

const FIELD_TYPES = [
  { type: "signature", label: "Signature" },
  { type: "initials",  label: "Initials"  },
  { type: "date",      label: "Date"      },
  { type: "full_name", label: "Full Name" },
  { type: "text",      label: "Text"      },
  { type: "checkbox",  label: "Checkbox"  },
  { type: "dropdown",  label: "Dropdown"  },
] as const

const SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2]

interface DocumentEditorProps {
  documentId: string
}

export function DocumentEditor({ documentId }: DocumentEditorProps) {
  const router = useRouter()

  const { data: docData } = useDocument(documentId)
  const title = docData?.data?.title ?? "Untitled document"

  const { data: pdfUrlData, isLoading: pdfLoading, error: pdfError } = useDocumentPdfUrl(documentId)
  const { data: fieldsData, isLoading: fieldsLoading } = useDocumentFields(documentId)
  const saveFields = useSaveFields(documentId)
  const detectFields = useDetectFields(documentId)
  const sendDocument = useSendDocument(documentId)

  const [fields, setFields] = useState<PlacedField[]>([])
  const [signers, setSigners] = useState<Signer[]>([])
  const [activeSignerEmail, setActiveSignerEmail] = useState<string | null>(null)
  const [activeFieldType, setActiveFieldType] = useState<string | null>(null)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [scaleIdx, setScaleIdx] = useState(2)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  // Suppresses observer-driven page updates briefly after a button-nav scroll
  // so the counter doesn't flicker (e.g. 2→1→2) during smooth scroll animation.
  const suppressObserver = useRef(false)
  const [saved, setSaved] = useState(false)
  const [showMobilePalette, setShowMobilePalette] = useState(false)
  const hasHydrated = useRef(false)

  // Hydrate fields + reconstruct signers from server on INITIAL load only.
  // Signer names aren't stored in the DB (only assignedToEmail), so we derive
  // them from the email. Colors are assigned by first-seen signer order so the
  // same signer always gets the same color regardless of session.
  useEffect(() => {
    if (!fieldsData?.data?.fields || hasHydrated.current) return
    hasHydrated.current = true

    const rawFields = fieldsData.data.fields

    // Reconstruct unique signers in first-appearance order
    const seenEmails = new Set<string>()
    const reconstructedSigners: Signer[] = []
    for (const f of rawFields) {
      if (f.assignedToEmail && !seenEmails.has(f.assignedToEmail)) {
        seenEmails.add(f.assignedToEmail)
        reconstructedSigners.push({
          email: f.assignedToEmail,
          // Name not stored separately — use the local-part of the email as display name
          name: f.assignedToEmail.split("@")[0],
          color: SIGNER_COLORS[reconstructedSigners.length % SIGNER_COLORS.length],
        })
      }
    }

    // email → color map so every field assigned to a signer gets the right color
    const colorMap: Record<string, string> = Object.fromEntries(
      reconstructedSigners.map((s) => [s.email, s.color]),
    )

    setSigners(reconstructedSigners)
    if (reconstructedSigners.length > 0) {
      setActiveSignerEmail(reconstructedSigners[0].email)
    }
    setFields(
      rawFields.map((f) => ({
        ...f,
        color: f.assignedToEmail ? (colorMap[f.assignedToEmail] ?? "#6ee7b7") : "#6ee7b7",
      })),
    )
  }, [fieldsData])

  const handlePlace = useCallback(
    (field: Omit<PlacedField, "id">) => {
      const activeSigner = signers.find((s) => s.email === activeSignerEmail)
      setFields((prev) => [
        ...prev,
        {
          ...field,
          id: `local-${Date.now()}-${Math.random()}`,
          color: activeSigner?.color ?? "#6ee7b7",
          assignedToEmail: activeSigner?.email ?? "",
        },
      ])
      setActiveFieldType(null)
    },
    [signers, activeSignerEmail],
  )

  const handleMove = useCallback((id: string, x: number, y: number) => {
    if (isNaN(x) || isNaN(y)) {
      setFields((prev) => prev.filter((f) => f.id !== id))
      setSelectedFieldId(null)
    } else {
      setFields((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)))
    }
  }, [])

  const handleResize = useCallback((id: string, x: number, y: number, width: number, height: number) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, x, y, width, height } : f)))
  }, [])

  const handleAddSigner = useCallback((signer: Signer) => {
    setSigners((prev) => [...prev, signer])
    setActiveSignerEmail(signer.email)
  }, [])

  const handleRemoveSigner = useCallback((email: string) => {
    setSigners((prev) => prev.filter((s) => s.email !== email))
    setActiveSignerEmail((cur) => (cur === email ? null : cur))
    // Unassign fields that belonged to this signer
    setFields((prev) =>
      prev.map((f) => (f.assignedToEmail === email ? { ...f, assignedToEmail: "", color: "#6ee7b7" } : f)),
    )
  }, [])

  const handleAssignField = useCallback(
    (fieldId: string, email: string) => {
      const signer = signers.find((s) => s.email === email)
      if (!signer) return
      setFields((prev) =>
        prev.map((f) =>
          f.id === fieldId ? { ...f, assignedToEmail: email, color: signer.color } : f,
        ),
      )
    },
    [signers],
  )

  const handleSave = useCallback(async () => {
    try {
      const result = await saveFields.mutateAsync(
        fields.map(({ id: _id, color: _color, ...rest }) => rest),
      )
      // Merge server-assigned IDs back, coloring by signer email (not array index)
      if (result?.data?.fields) {
        const colorMap: Record<string, string> = Object.fromEntries(
          signers.map((s) => [s.email, s.color]),
        )
        setFields(
          result.data.fields.map((sf: PlacedField) => ({
            ...sf,
            color: sf.assignedToEmail ? (colorMap[sf.assignedToEmail] ?? "#6ee7b7") : "#6ee7b7",
          })),
        )
      }
      setSaved(true)
      toast.success("Fields saved")
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.error("Failed to save fields")
    }
  }, [fields, signers, saveFields])

  const handleDetectFields = useCallback(async () => {
    try {
      const result = await detectFields.mutateAsync()
      toast.info(result.data.message ?? "AI detection complete")
    } catch {
      toast.error("Auto-detect failed")
    }
  }, [detectFields])

  // Send for Signing — disabled until: ≥1 field, all fields have signer, ≥1 signer
  const canSend =
    fields.length > 0 &&
    signers.length > 0 &&
    fields.every((f) => f.assignedToEmail !== "")

  const scale = SCALES[scaleIdx]

  // ── Loading state ──────────────────────────────────────────────────────────
  if (pdfLoading || fieldsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-160px)] gap-3 text-foreground-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <span className="text-sm">Loading document…</span>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (pdfError || !pdfUrlData) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-160px)] gap-3">
        <p className="text-sm text-error">Failed to load document.</p>
        <Button variant="outline" size="sm" onClick={() => router.refresh()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 112px)" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-border shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => router.push("/documents")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-sm font-semibold truncate">{title}</h1>
          {pageCount > 0 && (
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={currentPage <= 1}
                onClick={() => {
                  const p = Math.max(1, currentPage - 1)
                  setCurrentPage(p)
                  suppressObserver.current = true
                  document.getElementById(`pdf-page-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  setTimeout(() => { suppressObserver.current = false }, 900)
                }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-foreground-muted tabular-nums w-12 text-center">
                {currentPage}/{pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={currentPage >= pageCount}
                onClick={() => {
                  const p = Math.min(pageCount, currentPage + 1)
                  setCurrentPage(p)
                  suppressObserver.current = true
                  document.getElementById(`pdf-page-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                  setTimeout(() => { suppressObserver.current = false }, 900)
                }}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Zoom */}
          <Button variant="outline" size="sm" title="zoom-out" disabled={scaleIdx === 0}
            onClick={() => setScaleIdx((i) => Math.max(0, i - 1))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" title="zoom-in" disabled={scaleIdx === SCALES.length - 1}
            onClick={() => setScaleIdx((i) => Math.min(SCALES.length - 1, i + 1))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>

          <div className="w-px h-5 bg-border mx-1" />

          {/* Save */}
          <Button size="sm" variant="outline" disabled={saveFields.isPending || saved} onClick={handleSave}>
            {saveFields.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : saved ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-brand" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            {saved ? "Saved" : "Save fields"}
          </Button>

          {/* Send for Signing */}
          <Button
            size="sm"
            disabled={!canSend || sendDocument.isPending}
            title={
              !canSend
                ? fields.length === 0
                  ? "Place at least one field"
                  : signers.length === 0
                  ? "Add at least one signer"
                  : "Assign all fields to a signer"
                : "Send for signing"
            }
            onClick={async () => {
              try {
                await sendDocument.mutateAsync(
                  signers.map((s) => ({ email: s.email, name: s.name })),
                )
                toast.success("Sent for signing! Signers will receive an email shortly.")
                router.push("/documents")
              } catch (err: any) {
                toast.error(err.message ?? "Failed to send")
              }
            }}
          >
            {sendDocument.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5" />
            )}
            Send for Signing
          </Button>
        </div>
      </div>

      {/* ── Editor body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: field palette */}
        <aside className="w-44 shrink-0 border-r border-border overflow-y-auto py-4 px-3 flex-col gap-1 hidden sm:flex">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">Fields</p>
          {FIELD_TYPES.map(({ type, label }) => {
            const activeSigner = signers.find((s) => s.email === activeSignerEmail)
            const color = activeSigner?.color ?? "#6ee7b7"
            const isActive = activeFieldType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveFieldType((cur) => (cur === type ? null : type))}
                className={cn(
                  "w-full text-left text-xs px-3 py-2 rounded-md font-medium transition-all border",
                  isActive
                    ? "border-opacity-40"
                    : "border-transparent hover:bg-surface-raised text-foreground-muted hover:text-foreground",
                )}
                style={isActive ? { borderColor: `${color}66`, color, backgroundColor: `${color}18` } : undefined}
              >
                {label}
              </button>
            )
          })}

          {activeFieldType && (
            <p className="text-[10px] text-foreground-subtle mt-3 leading-relaxed">
              Click the document to place a{" "}
              <span className="font-medium text-foreground">
                {FIELD_TYPES.find((t) => t.type === activeFieldType)?.label}
              </span>{" "}
              field.
            </p>
          )}

          {/* Auto-detect fields stub */}
          <div className="mt-auto pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleDetectFields}
              disabled={detectFields.isPending}
              className="w-full flex items-center gap-2 text-left text-xs px-3 py-2 rounded-md font-medium border border-dashed border-border text-foreground-muted hover:text-foreground hover:border-brand transition-colors disabled:opacity-50"
            >
              {detectFields.isPending
                ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                : <Wand2 className="h-3 w-3 shrink-0" />
              }
              Auto-detect fields
            </button>
          </div>
        </aside>

        {/* Center: PDF viewer */}
        <div className="flex-1 overflow-y-auto overflow-x-auto bg-surface-raised relative">
          {/* Empty state — no fields yet */}
          {fields.length === 0 && !activeFieldType && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none z-10">
              <div className="bg-surface-elevated border border-border rounded-xl px-6 py-5 flex flex-col items-center gap-2 text-center max-w-xs shadow-xl">
                <FileText className="h-8 w-8 text-foreground-subtle" />
                <p className="text-sm font-medium">No fields placed</p>
                <p className="text-xs text-foreground-muted hidden sm:block">
                  Select a field type from the left panel, then click anywhere on the document.
                </p>
                <p className="text-xs text-foreground-muted sm:hidden">
                  Tap the + button below to pick a field type, then tap the document.
                </p>
              </div>
            </div>
          )}

          <PdfViewer
            pdfUrl={pdfUrlData}
            scale={scale}
            fields={fields}
            activeFieldType={activeFieldType}
            selectedFieldId={selectedFieldId}
            onPageCount={setPageCount}
            onFieldPlace={handlePlace}
            onFieldMove={handleMove}
            onFieldResize={handleResize}
            onFieldSelect={setSelectedFieldId}
            currentPage={currentPage}
            onPageChange={(p) => { if (!suppressObserver.current) setCurrentPage(p) }}
          />
        </div>

        {/* Right: signer panel */}
        <SignerPanel
          signers={signers}
          activeSignerEmail={activeSignerEmail}
          fields={fields}
          selectedFieldId={selectedFieldId}
          onAddSigner={handleAddSigner}
          onRemoveSigner={handleRemoveSigner}
          onSetActive={setActiveSignerEmail}
          onAssignField={handleAssignField}
        />
      </div>

      {/* ── Mobile FAB — hidden on sm+ (desktop uses left sidebar) ──────────── */}
      <div className="sm:hidden">
        {activeFieldType ? (
          // In placement mode: floating cancel pill so user can escape
          <button
            type="button"
            onClick={() => setActiveFieldType(null)}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-elevated border border-border shadow-xl text-sm font-medium"
          >
            <X className="h-4 w-4" />
            Cancel placement
          </button>
        ) : (
          // Normal mode: + FAB opens field-type bottom sheet
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-brand text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Add field"
          >
            <Plus className="h-6 w-6" />
          </button>
        )}

        {/* Bottom sheet — field type palette */}
        {showMobilePalette && (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            onClick={() => setShowMobilePalette(false)}
          >
            {/* Scrim */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Sheet */}
            <div
              className="relative bg-surface rounded-t-2xl px-4 pt-3 pb-8 flex flex-col gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag pill */}
              <div className="w-10 h-1 bg-border rounded-full mx-auto" />

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Select field type</p>
                <button
                  type="button"
                  onClick={() => setShowMobilePalette(false)}
                  className="text-foreground-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Active signer hint */}
              {activeSignerEmail && (
                <p className="text-xs text-foreground-muted -mt-2">
                  Placing as{" "}
                  <span className="font-medium text-foreground">
                    {signers.find((s) => s.email === activeSignerEmail)?.name ?? activeSignerEmail}
                  </span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                {FIELD_TYPES.map(({ type, label }) => {
                  const activeSigner = signers.find((s) => s.email === activeSignerEmail)
                  const color = activeSigner?.color ?? "#6ee7b7"
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setActiveFieldType(type)
                        setShowMobilePalette(false)
                      }}
                      className="flex items-center gap-2 px-3 py-3 rounded-xl border border-border text-sm font-medium text-left active:scale-95 transition-transform"
                      style={{ borderColor: `${color}44`, backgroundColor: `${color}10`, color }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
