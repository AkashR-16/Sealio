"use client"

import { useRef, useCallback, useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PlacedField {
  id: string
  type: string
  page: number
  x: number      // % of page width (0-100)
  y: number      // % of page height (0-100)
  width: number  // % of page width
  height: number // % of page height
  required: boolean
  assignedToEmail: string
  color?: string
}

const FIELD_DEFAULTS: Record<string, { width: number; height: number }> = {
  signature:  { width: 20, height: 6 },
  initials:   { width: 10, height: 5 },
  date:       { width: 14, height: 4 },
  full_name:  { width: 18, height: 4 },
  text:       { width: 16, height: 4 },
  checkbox:   { width: 4,  height: 4 },
  dropdown:   { width: 16, height: 4 },
}

const FIELD_LABELS: Record<string, string> = {
  signature: "Signature",
  initials: "Initials",
  date: "Date",
  full_name: "Full Name",
  text: "Text",
  checkbox: "Checkbox",
  dropdown: "Dropdown",
}

// Snap field positions to a 1% grid for clean alignment
const SNAP = 1
const snapTo = (v: number) => Math.round(v / SNAP) * SNAP

type ResizeHandle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"

interface ResizeState {
  fieldId: string
  handle: ResizeHandle
  startX: number
  startY: number
  origX: number
  origY: number
  origW: number
  origH: number
}

interface FieldCanvasProps {
  pageNum: number
  width: number
  height: number
  fields: PlacedField[]
  activeFieldType: string | null
  selectedFieldId: string | null
  onPlace: (field: Omit<PlacedField, "id">) => void
  onMove: (id: string, x: number, y: number) => void
  onResize: (id: string, x: number, y: number, width: number, height: number) => void
  onSelect: (id: string | null) => void
}

export function FieldCanvas({
  pageNum,
  width,
  height,
  fields,
  activeFieldType,
  selectedFieldId,
  onPlace,
  onMove,
  onResize,
  onSelect,
}: FieldCanvasProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ fieldId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeState = useRef<ResizeState | null>(null)

  // Detect mobile for handle sizing and count
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const pctX = useCallback((clientX: number) => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
  }, [])

  const pctY = useCallback((clientY: number) => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
  }, [])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (!activeFieldType) {
        onSelect(null)
        return
      }
      const x = pctX(e.clientX)
      const y = pctY(e.clientY)
      const defaults = FIELD_DEFAULTS[activeFieldType] ?? { width: 16, height: 4 }
      onPlace({
        type: activeFieldType,
        page: pageNum,
        x: snapTo(Math.max(0, Math.min(x, 100 - defaults.width))),
        y: snapTo(Math.max(0, Math.min(y, 100 - defaults.height))),
        width: defaults.width,
        height: defaults.height,
        required: true,
        assignedToEmail: "",
      })
    },
    [activeFieldType, pageNum, pctX, pctY, onPlace, onSelect],
  )

  // ── Move drag ─────────────────────────────────────────────────────────────
  const handleFieldPointerDown = useCallback(
    (e: React.PointerEvent, field: PlacedField) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      onSelect(field.id)
      dragState.current = {
        fieldId: field.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: field.x,
        origY: field.y,
      }
    },
    [onSelect],
  )

  const handleFieldPointerMove = useCallback(
    (e: React.PointerEvent, field: PlacedField) => {
      if (!dragState.current || dragState.current.fieldId !== field.id) return
      const rect = overlayRef.current!.getBoundingClientRect()
      const dx = ((e.clientX - dragState.current.startX) / rect.width) * 100
      const dy = ((e.clientY - dragState.current.startY) / rect.height) * 100
      onMove(
        field.id,
        snapTo(Math.max(0, Math.min(100 - field.width, dragState.current.origX + dx))),
        snapTo(Math.max(0, Math.min(100 - field.height, dragState.current.origY + dy))),
      )
    },
    [onMove],
  )

  const handleFieldPointerUp = useCallback(() => {
    dragState.current = null
  }, [])

  // ── Resize drag ────────────────────────────────────────────────────────────
  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent, field: PlacedField, handle: ResizeHandle) => {
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      resizeState.current = {
        fieldId: field.id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origX: field.x,
        origY: field.y,
        origW: field.width,
        origH: field.height,
      }
    },
    [],
  )

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent, field: PlacedField) => {
      const rs = resizeState.current
      if (!rs || rs.fieldId !== field.id) return
      const rect = overlayRef.current!.getBoundingClientRect()
      const dx = ((e.clientX - rs.startX) / rect.width) * 100
      const dy = ((e.clientY - rs.startY) / rect.height) * 100

      let { origX: x, origY: y, origW: w, origH: h } = rs

      const clampW = (v: number) => Math.max(4, Math.min(Math.max(4, 100 - x), v))
      const clampH = (v: number) => Math.max(2, Math.min(Math.max(2, 100 - y), v))

      if (rs.handle === "se") {
        w = clampW(w + dx); h = clampH(h + dy)
      } else if (rs.handle === "sw") {
        const nx = Math.max(0, Math.min(x + w - 4, x + dx))
        w = Math.max(4, w - (nx - x)); x = nx; h = clampH(h + dy)
      } else if (rs.handle === "ne") {
        w = clampW(w + dx)
        const ny = Math.max(0, Math.min(y + h - 2, y + dy))
        h = Math.max(2, h - (ny - y)); y = ny
      } else if (rs.handle === "nw") {
        const nx = Math.max(0, Math.min(x + w - 4, x + dx))
        w = Math.max(4, w - (nx - x)); x = nx
        const ny = Math.max(0, Math.min(y + h - 2, y + dy))
        h = Math.max(2, h - (ny - y)); y = ny
      } else if (rs.handle === "e") {
        w = clampW(w + dx)
      } else if (rs.handle === "w") {
        const nx = Math.max(0, Math.min(x + w - 4, x + dx))
        w = Math.max(4, w - (nx - x)); x = nx
      } else if (rs.handle === "s") {
        h = clampH(h + dy)
      } else if (rs.handle === "n") {
        const ny = Math.max(0, Math.min(y + h - 2, y + dy))
        h = Math.max(2, h - (ny - y)); y = ny
      }

      onResize(field.id, x, y, w, h)
    },
    [onResize],
  )

  const handleResizePointerUp = useCallback(() => {
    resizeState.current = null
  }, [])

  // Desktop: 8 handles. Mobile: 4 corners only with 44px touch targets.
  // Handle offset math: visual dot center sits at the field corner (-5px from edge
  // for 10px dot). A 44px mobile target centered at the same point → offset -22px.
  const cornerHandles = isMobile
    ? ([
        { h: "nw", pos: { top: -22, left: -22 },   cursor: "nwse-resize" },
        { h: "ne", pos: { top: -22, right: -22 },   cursor: "nesw-resize" },
        { h: "sw", pos: { bottom: -22, left: -22 }, cursor: "nesw-resize" },
        { h: "se", pos: { bottom: -22, right: -22 }, cursor: "nwse-resize" },
      ] as { h: ResizeHandle; pos: React.CSSProperties; cursor: string }[])
    : ([
        { h: "nw", pos: { top: -5, left: -5 },   cursor: "nwse-resize" },
        { h: "ne", pos: { top: -5, right: -5 },   cursor: "nesw-resize" },
        { h: "sw", pos: { bottom: -5, left: -5 }, cursor: "nesw-resize" },
        { h: "se", pos: { bottom: -5, right: -5 }, cursor: "nwse-resize" },
      ] as { h: ResizeHandle; pos: React.CSSProperties; cursor: string }[])

  const edgeHandles = isMobile
    ? []
    : ([
        { h: "n", pos: { top: -5, left: "calc(50% - 5px)" }, cursor: "ns-resize" },
        { h: "s", pos: { bottom: -5, left: "calc(50% - 5px)" }, cursor: "ns-resize" },
        { h: "e", pos: { right: -5, top: "calc(50% - 5px)" }, cursor: "ew-resize" },
        { h: "w", pos: { left: -5, top: "calc(50% - 5px)" }, cursor: "ew-resize" },
      ] as { h: ResizeHandle; pos: React.CSSProperties; cursor: string }[])

  const allHandles = [...cornerHandles, ...edgeHandles]

  return (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0",
        activeFieldType ? "cursor-crosshair" : "cursor-default",
      )}
      // Prevent page scroll when tapping to place a field; allow scroll otherwise
      style={{ touchAction: activeFieldType ? "none" : "auto" }}
      onClick={handleOverlayClick}
    >
      {fields.map((field) => {
        const isSelected = field.id === selectedFieldId
        const color = field.color ?? "#6ee7b7"

        return (
          <div
            key={field.id}
            className="absolute group select-none"
            style={{
              left: `${field.x}%`,
              top: `${field.y}%`,
              width: `${field.width}%`,
              height: `${field.height}%`,
              // Prevent page scroll while dragging a field on touch devices
              touchAction: "none",
            }}
            onPointerDown={(e) => handleFieldPointerDown(e, field)}
            onPointerMove={(e) => {
              handleFieldPointerMove(e, field)
              handleResizePointerMove(e, field)
            }}
            onPointerUp={() => {
              handleFieldPointerUp()
              handleResizePointerUp()
            }}
            onClick={(e) => { e.stopPropagation(); onSelect(field.id) }}
          >
            {/* Field box */}
            <div
              className="w-full h-full rounded flex items-center justify-center text-[10px] font-medium overflow-hidden transition-all"
              style={{
                border: `2px solid ${color}`,
                backgroundColor: `${color}1a`,
                color: color,
                boxShadow: isSelected ? `0 0 0 2px ${color}55` : undefined,
              }}
            >
              <span className="truncate px-1">{FIELD_LABELS[field.type] ?? field.type}</span>
            </div>

            {/* Delete button — visible on hover (desktop) or when selected (touch) */}
            <button
              type="button"
              className={cn(
                "absolute -top-2 -right-2 h-5 w-5 rounded-full bg-error text-white flex items-center justify-center z-10 transition-opacity duration-100",
                isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onMove(field.id, NaN, NaN)
              }}
            >
              <X className="h-3 w-3" />
            </button>

            {/* Resize handles — shown when selected.
                Mobile: 4 corners, 44×44px touch target with 10px visual inside.
                Desktop: 8 handles (4 corners + 4 edges), 10px visual. */}
            {isSelected && allHandles.map(({ h: handle, pos, cursor }) => (
              <div
                key={handle}
                className="absolute z-20 flex items-center justify-center"
                style={{
                  width: isMobile ? 44 : 10,
                  height: isMobile ? 44 : 10,
                  cursor,
                  touchAction: "none",
                  ...pos,
                }}
                onPointerDown={(e) => handleResizePointerDown(e, field, handle)}
              >
                <div
                  className="h-2.5 w-2.5 rounded-sm border-2 border-white shrink-0"
                  style={{ backgroundColor: color }}
                />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
