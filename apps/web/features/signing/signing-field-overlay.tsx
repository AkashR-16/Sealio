"use client"

import { CheckCircle, PenLine, Calendar, Type, AlignLeft, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SigningField } from "./queries"

const FIELD_ICONS: Record<string, React.ReactNode> = {
  signature: <PenLine className="h-3.5 w-3.5" />,
  initials: <PenLine className="h-3 w-3" />,
  date: <Calendar className="h-3.5 w-3.5" />,
  full_name: <Type className="h-3.5 w-3.5" />,
  text: <AlignLeft className="h-3.5 w-3.5" />,
  checkbox: <CheckSquare className="h-3.5 w-3.5" />,
}

const FIELD_LABELS: Record<string, string> = {
  signature: "Sign here",
  initials: "Initials",
  date: "Date",
  full_name: "Full name",
  text: "Text",
  checkbox: "Checkbox",
}

interface SigningFieldOverlayProps {
  pageNum: number
  fields: SigningField[]
  activeFieldId: string | null
  onFieldClick: (field: SigningField) => void
  locked?: boolean
}

export function SigningFieldOverlay({ pageNum, fields, activeFieldId, onFieldClick, locked = false }: SigningFieldOverlayProps) {
  const pageFields = fields.filter((f) => f.page === pageNum)

  return (
    <div className="absolute inset-0 pointer-events-none">
      {pageFields.map((field) => {
        const isActive = field.id === activeFieldId
        const isSigned = field.signed

        return (
          <button
            key={field.id}
            type="button"
            className={cn(
              "absolute pointer-events-auto transition-all duration-150 rounded",
              "flex items-center justify-center gap-1 text-xs font-medium overflow-hidden",
              locked
                ? "border-2 border-border/40 bg-surface-raised/40 text-foreground-subtle opacity-50 cursor-not-allowed"
                : isSigned
                ? "border-2 border-success/60 bg-success/15 text-success"
                : isActive
                ? "border-2 border-brand bg-brand/20 text-brand animate-pulse"
                : field.required
                ? "border-2 border-brand/70 bg-brand/10 text-brand hover:bg-brand/20 active:scale-95"
                : "border-2 border-border bg-surface-raised/80 text-foreground-muted hover:border-brand/50",
            )}
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
              touchAction: "manipulation",
              minHeight: 44,   // Amy gate: 44px touch target
            }}
            onClick={() => onFieldClick(field)}
            aria-label={`${isSigned ? "Signed" : "Sign"} ${FIELD_LABELS[field.type] ?? field.type} field`}
          >
            {/* Unsigned: show field type icon + label */}
            {!isSigned && (
              <>
                {FIELD_ICONS[field.type]}
                <span className="truncate hidden sm:block">{FIELD_LABELS[field.type] ?? field.type}</span>
              </>
            )}

            {/* Signed with image (draw / type rendered to canvas / upload) */}
            {isSigned && field.value?.startsWith("data:image") && (
              <img
                src={field.value}
                alt="signature"
                className="absolute inset-0 w-full h-full object-contain p-0.5"
              />
            )}

            {/* Signed with plain text (date, full_name, text) */}
            {isSigned && field.captureMethod === "auto" && field.value && (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold px-1 truncate">
                {field.value}
              </span>
            )}

            {/* Signed with no previewable value */}
            {isSigned && !field.value && (
              <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            )}
          </button>
        )
      })}
    </div>
  )
}
