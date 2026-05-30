"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { CheckCircle, Loader2, ChevronDown, Eye, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { OtpScreen } from "./otp-screen"
import { SigningFieldOverlay } from "./signing-field-overlay"
import { SignatureModal } from "./signature-modal"
import { usePageTimeTracker } from "./use-page-time"
import {
  useSigningRequest,
  useVerifyOtp,
  useSigningFields,
  useSigningDocumentUrl,
  useSubmitField,
  useCompleteSign,
  type SigningField,
} from "./queries"

const PdfViewer = dynamic(
  () => import("../documents/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false, loading: () => <div className="flex-1 bg-surface animate-pulse min-h-96" /> },
)

interface SignPageProps {
  token: string
}

export function SignPage({ token }: SignPageProps) {
  const [verified, setVerified] = useState(false)
  const [activeField, setActiveField] = useState<SigningField | null>(null)
  const [applyToAll, setApplyToAll] = useState(false)
  const [fields, setFields] = useState<SigningField[]>([])
  const [completed, setCompleted] = useState(false)
  const [completeError, setCompleteError] = useState("")
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const { startTracking, stopTracking, getPageTimes } = usePageTimeTracker(pageCount)
  const [scale] = useState(1)
  const [hasReadDoc, setHasReadDoc] = useState(false)
  const bottomBarRef = useRef<HTMLDivElement>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)

  const { data: srData, isLoading: srLoading, error: srError } = useSigningRequest(token)
  const verifyOtp = useVerifyOtp(token)
  const { data: fieldsData, isLoading: fieldsLoading, refetch: refetchFields } = useSigningFields(token, verified)
  const { data: pdfUrl, isLoading: pdfLoading } = useSigningDocumentUrl(token, verified)
  const submitField = useSubmitField(token)
  const completeSign = useCompleteSign(token)

  // Hydrate fields from server
  useEffect(() => {
    if (fieldsData?.data?.fields) {
      setFields(fieldsData.data.fields)
    }
  }, [fieldsData])

  // If already verified (page reload), skip OTP
  useEffect(() => {
    if (srData?.data?.alreadyVerified) setVerified(true)
  }, [srData])

  const handleOtpVerified = useCallback(() => setVerified(true), [])

  // Start page time tracking once PDF pages are in the DOM
  useEffect(() => {
    if (!verified || pageCount === 0) return
    // Small delay so all page elements are mounted
    const t = setTimeout(startTracking, 500)
    return () => { clearTimeout(t); stopTracking() }
  }, [verified, pageCount, startTracking, stopTracking])

  // Read gate: mark doc as read once user scrolls to 80% of the PDF container
  useEffect(() => {
    if (!verified || hasReadDoc) return
    const el = pdfContainerRef.current
    if (!el) return
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight || scrollTop / (scrollHeight - clientHeight) >= 0.8) {
        setHasReadDoc(true)
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    // Also fire once in case doc fits on screen (no scroll needed)
    onScroll()
    return () => el.removeEventListener("scroll", onScroll)
  }, [verified, hasReadDoc])

  const handleFieldClick = useCallback((field: SigningField) => {
    setActiveField(field)
    setApplyToAll(false)
  }, [])

  const handleFieldConfirm = useCallback(
    async (value: string, captureMethod: string) => {
      if (!activeField) return

      // Determine fields to submit
      const targets: SigningField[] =
        applyToAll && (activeField.type === "signature" || activeField.type === "initials")
          ? fields.filter((f) => f.type === activeField.type && !f.signed)
          : [activeField]

      // Optimistic update
      setFields((prev) =>
        prev.map((f) =>
          targets.some((t) => t.id === f.id)
            ? { ...f, signed: true, value, captureMethod }
            : f,
        ),
      )
      setActiveField(null)

      // Submit to API
      await Promise.all(
        targets.map((t) => submitField.mutateAsync({ fieldId: t.id, value, captureMethod })),
      ).catch(() => refetchFields()) // rollback on error
    },
    [activeField, applyToAll, fields, submitField, refetchFields],
  )

  const handleComplete = useCallback(async () => {
    setCompleteError("")
    try {
      const pageTimes = getPageTimes()
      await completeSign.mutateAsync(pageTimes.length > 0 ? pageTimes : undefined)
      stopTracking()
      setCompleted(true)
    } catch (err: any) {
      setCompleteError(err.message ?? "Failed to complete signing")
    }
  }, [completeSign, getPageTimes, stopTracking])

  // ── Next unsigned field for the sticky bar ──────────────────────────────────
  const signedCount = fields.filter((f) => f.signed).length
  const totalRequired = fields.filter((f) => f.required).length
  const nextUnsigned = fields.find((f) => f.required && !f.signed)
  const allRequiredSigned = totalRequired === 0 || fields.filter((f) => f.required).every((f) => f.signed)

  const jumpToField = useCallback((field: SigningField) => {
    const el = document.getElementById(`pdf-page-${field.page}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveField(field)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  if (srLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-3 text-foreground-muted">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
        <span>Loading…</span>
      </div>
    )
  }

  if (srError || !srData?.data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-center px-4">
        <AlertCircle className="h-12 w-12 text-error" />
        <h1 className="text-xl font-bold">Invalid signing link</h1>
        <p className="text-sm text-foreground-muted max-w-sm">
          This link may have expired or already been used. Please contact the sender.
        </p>
      </div>
    )
  }

  const { signerName, signerEmail, document: doc } = srData.data

  // ── Completed screen ──────────────────────────────────────────────────────
  if (completed || srData.data.status === "signed") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircle className="h-10 w-10 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Document signed!</h1>
          <p className="text-foreground-muted mt-2 max-w-sm">
            You've successfully signed <strong>{doc.title}</strong>. All parties will receive a completion email.
          </p>
        </div>
        <p className="text-xs text-foreground-subtle">
          Secured by <span className="font-semibold text-brand">Sealio</span>
        </p>
      </div>
    )
  }

  // ── OTP screen ──────────────────────────────────────────────────────────────
  if (!verified) {
    return (
      <OtpScreen
        signerName={signerName}
        documentTitle={doc.title}
        signerEmail={signerEmail}
        onVerified={handleOtpVerified}
        onVerify={async (otp) => { await verifyOtp.mutateAsync(otp) }}
      />
    )
  }

  // ── Signing view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ touchAction: "pan-y" }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{doc.title}</p>
          <p className="text-xs text-foreground-muted truncate">Signing as {signerName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {totalRequired > 0 && (
            <span className="text-xs text-foreground-muted tabular-nums">
              {signedCount}/{totalRequired}
            </span>
          )}
          <Button
            size="sm"
            disabled={!allRequiredSigned || !hasReadDoc || completeSign.isPending}
            onClick={handleComplete}
            className="whitespace-nowrap"
          >
            {completeSign.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
            )}
            Complete
          </Button>
        </div>
      </header>

      {completeError && (
        <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {completeError}
        </div>
      )}

      {/* PDF + fields */}
      <div ref={pdfContainerRef} className="flex-1 overflow-y-auto overflow-x-auto bg-surface-raised pb-28">
        {pdfLoading || fieldsLoading ? (
          <div className="flex items-center justify-center h-96 gap-3 text-foreground-muted">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
            <span className="text-sm">Loading document…</span>
          </div>
        ) : pdfUrl ? (
          <PdfViewer
            pdfUrl={pdfUrl}
            scale={scale}
            fields={[]}
            activeFieldType={null}
            selectedFieldId={null}
            onPageCount={setPageCount}
            onFieldPlace={() => {}}
            onFieldMove={() => {}}
            onFieldResize={() => {}}
            onFieldSelect={() => {}}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            overlayChildren={(pageNum: number) => (
              <SigningFieldOverlay
                pageNum={pageNum}
                fields={fields}
                activeFieldId={activeField?.id ?? null}
                onFieldClick={hasReadDoc ? handleFieldClick : () => {}}
                locked={!hasReadDoc}
              />
            )}
          />
        ) : null}
      </div>

      {/* Sticky bottom bar */}
      <div
        ref={bottomBarRef}
        className="fixed bottom-0 left-0 right-0 z-30 bg-surface/95 backdrop-blur border-t border-border px-4 py-3"
      >
        {/* Read gate banner */}
        {!hasReadDoc && !pdfLoading && !fieldsLoading && (
          <div className="flex items-center justify-center gap-2 text-sm text-foreground-muted py-1 mb-2">
            <Eye className="h-4 w-4 text-brand" />
            <span>Please scroll through the document before signing</span>
            <ChevronDown className="h-4 w-4 text-brand animate-bounce" />
          </div>
        )}

        {allRequiredSigned ? (
          <Button className="w-full" size="lg" onClick={handleComplete} disabled={completeSign.isPending}>
            {completeSign.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Complete Signing
          </Button>
        ) : nextUnsigned ? (
          <button
            type="button"
            onClick={() => jumpToField(nextUnsigned)}
            className="w-full flex items-center justify-between bg-brand text-background font-semibold rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <span className="text-sm">
              {signedCount === 0
                ? `Sign field 1 of ${totalRequired}`
                : `Next: field ${signedCount + 1} of ${totalRequired}`}
            </span>
            <ChevronDown className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center justify-center gap-2 text-sm text-foreground-muted py-1">
            <CheckCircle className="h-4 w-4 text-success" />
            All fields signed
          </div>
        )}
      </div>

      {/* Signature modal */}
      {activeField && (
        <SignatureModal
          field={activeField}
          signerName={signerName}
          applyToAll={applyToAll}
          onApplyToAllChange={setApplyToAll}
          onConfirm={handleFieldConfirm}
          onClose={() => setActiveField(null)}
        />
      )}
    </div>
  )
}
