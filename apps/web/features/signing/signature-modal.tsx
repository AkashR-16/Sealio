"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import ReactSignatureCanvas from "react-signature-canvas"
import { useDropzone } from "react-dropzone"
import { X, RotateCcw, Upload, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SigningField } from "./queries"

type Tab = "draw" | "type" | "upload"

const TYPE_FONTS = [
  { label: "Dancing Script", value: "'Dancing Script', cursive" },
  { label: "Pacifico", value: "'Pacifico', cursive" },
  { label: "Great Vibes", value: "'Great Vibes', cursive" },
  { label: "Sacramento", value: "'Sacramento', cursive" },
  { label: "Satisfy", value: "'Satisfy', cursive" },
]

// Load Google Fonts once
if (typeof document !== "undefined") {
  const id = "sealio-signature-fonts"
  if (!document.getElementById(id)) {
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href =
      "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Pacifico&family=Great+Vibes&family=Sacramento&family=Satisfy&display=swap"
    document.head.appendChild(link)
  }
}

interface SignatureModalProps {
  field: SigningField
  signerName: string
  applyToAll: boolean
  onApplyToAllChange: (val: boolean) => void
  onConfirm: (value: string, captureMethod: string) => void
  onClose: () => void
}

export function SignatureModal({ field, signerName, applyToAll, onApplyToAllChange, onConfirm, onClose }: SignatureModalProps) {
  const [tab, setTab] = useState<Tab>(["date", "text", "full_name", "checkbox"].includes(field.type) ? "type" : "draw")
  const [typedValue, setTypedValue] = useState(
    field.type === "date" ? new Date().toLocaleDateString()
    : field.type === "full_name" ? signerName
    : field.value ?? ""
  )
  const [selectedFont, setSelectedFont] = useState(TYPE_FONTS[0].value)
  const [uploadError, setUploadError] = useState("")
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const canvasRef = useRef<ReactSignatureCanvas | null>(null)

  const isTextOnlyField = ["date", "text", "full_name", "checkbox"].includes(field.type)
  const showTabs = !isTextOnlyField

  const handleConfirm = useCallback(() => {
    if (tab === "draw") {
      if (!canvasRef.current || canvasRef.current.isEmpty()) return
      const dataUrl = canvasRef.current.toDataURL("image/png")
      onConfirm(dataUrl, "draw")
    } else if (tab === "type") {
      if (!typedValue.trim()) return
      if (isTextOnlyField) {
        onConfirm(typedValue.trim(), "auto")
      } else {
        // Render typed signature to canvas
        const canvas = document.createElement("canvas")
        canvas.width = 500
        canvas.height = 150
        const ctx = canvas.getContext("2d")!
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = "#6ee7b7"
        ctx.font = `bold 56px ${selectedFont}`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(typedValue, 250, 75)
        onConfirm(canvas.toDataURL("image/png"), "type")
      }
    } else if (tab === "upload") {
      if (!uploadedImage) return
      onConfirm(uploadedImage, "upload")
    }
  }, [tab, typedValue, selectedFont, uploadedImage, isTextOnlyField, onConfirm])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted, rejected) => {
      if (rejected.length > 0) { setUploadError("Image must be PNG, JPG or GIF, max 2MB"); return }
      const file = accepted[0]
      const reader = new FileReader()
      reader.onload = (e) => { setUploadedImage(e.target?.result as string); setUploadError("") }
      reader.readAsDataURL(file)
    },
    accept: { "image/png": [], "image/jpeg": [], "image/gif": [] },
    maxSize: 2 * 1024 * 1024,
    multiple: false,
  })

  const canConfirm =
    (tab === "draw" && canvasRef.current && !canvasRef.current?.isEmpty()) ||
    (tab === "type" && typedValue.trim().length > 0) ||
    (tab === "upload" && !!uploadedImage)

  const fieldLabel = field.type === "signature" ? "Signature"
    : field.type === "initials" ? "Initials"
    : field.type === "date" ? "Date"
    : field.type === "full_name" ? "Full Name"
    : field.type === "checkbox" ? "Checkbox"
    : "Text"

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold">{fieldLabel}</h2>
          <button type="button" onClick={onClose} className="text-foreground-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        {showTabs && (
          <div className="flex border-b border-border px-5">
            {(["draw", "type", "upload"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize",
                  tab === t
                    ? "border-brand text-brand"
                    : "border-transparent text-foreground-muted hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="p-5">
          {/* ── Draw tab ──────────────────────────────────────────── */}
          {tab === "draw" && (
            <div>
              <div className="relative rounded-xl border border-border bg-white overflow-hidden" style={{ height: 160 }}>
                <ReactSignatureCanvas
                  ref={canvasRef}
                  canvasProps={{ className: "w-full h-full" }}
                  penColor="#6ee7b7"
                  backgroundColor="white"
                  dotSize={1.5}
                  minWidth={1}
                  maxWidth={3}
                  velocityFilterWeight={0.7}
                />
                <p className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-gray-300 select-none">
                  Draw your signature
                </p>
              </div>
              <button
                type="button"
                onClick={() => canvasRef.current?.clear()}
                className="mt-2 flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" /> Clear
              </button>
            </div>
          )}

          {/* ── Type tab ──────────────────────────────────────────── */}
          {tab === "type" && (
            <div className="space-y-4">
              <input
                type={field.type === "date" ? "date" : "text"}
                value={typedValue}
                onChange={(e) => setTypedValue(e.target.value)}
                placeholder={field.type === "full_name" ? signerName : "Enter text"}
                className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />

              {/* Font selector for signature/initials */}
              {!isTextOnlyField && (
                <div className="space-y-2">
                  <p className="text-xs text-foreground-muted">Choose style</p>
                  <div className="space-y-2">
                    {TYPE_FONTS.map((font) => (
                      <button
                        key={font.value}
                        type="button"
                        onClick={() => setSelectedFont(font.value)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 rounded-lg border transition-all",
                          selectedFont === font.value
                            ? "border-brand bg-brand/10"
                            : "border-border hover:border-brand/40",
                        )}
                      >
                        <span
                          style={{ fontFamily: font.value, fontSize: 24, color: "#6ee7b7" }}
                        >
                          {typedValue || signerName}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Upload tab ────────────────────────────────────────── */}
          {tab === "upload" && (
            <div className="space-y-3">
              {uploadedImage ? (
                <div className="relative rounded-xl border border-brand bg-brand/5 overflow-hidden" style={{ height: 160 }}>
                  <img src={uploadedImage} alt="signature" className="w-full h-full object-contain p-2" />
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="absolute top-2 right-2 h-6 w-6 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-foreground-muted hover:text-error"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={cn(
                    "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
                    isDragActive ? "border-brand bg-brand/10" : "border-border hover:border-brand/40",
                  )}
                  style={{ height: 160 }}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center gap-2 h-full justify-center">
                    <Upload className="h-6 w-6 text-foreground-muted" />
                    <p className="text-sm text-foreground-muted">Drop image here or click to browse</p>
                    <p className="text-xs text-foreground-subtle">PNG, JPG, GIF · Max 2MB</p>
                  </div>
                </div>
              )}
              {uploadError && (
                <div className="flex items-center gap-2 text-xs text-error">
                  <AlertCircle className="h-3.5 w-3.5" /> {uploadError}
                </div>
              )}
            </div>
          )}

          {/* Apply to all — only for signature/initials */}
          {(field.type === "signature" || field.type === "initials") && (
            <label className="flex items-center gap-2 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => onApplyToAllChange(e.target.checked)}
                className="accent-brand h-4 w-4"
              />
              <span className="text-sm text-foreground-muted">Apply to all {field.type} fields</span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 pb-5">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!canConfirm} onClick={handleConfirm}>
            Apply
          </Button>
        </div>
      </div>
    </div>
  )
}
