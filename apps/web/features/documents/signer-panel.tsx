"use client"

import { useState } from "react"
import { Plus, Trash2, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { PlacedField } from "./field-canvas"

export interface Signer {
  email: string
  name: string
  color: string
}

export const SIGNER_COLORS = [
  "#6ee7b7", // teal
  "#93c5fd", // blue
  "#fcd34d", // amber
  "#f9a8d4", // pink
  "#c4b5fd", // violet
]

interface SignerPanelProps {
  signers: Signer[]
  activeSignerEmail: string | null
  fields: PlacedField[]
  selectedFieldId: string | null
  onAddSigner: (signer: Signer) => void
  onRemoveSigner: (email: string) => void
  onSetActive: (email: string) => void
  onAssignField: (fieldId: string, email: string) => void
}

export function SignerPanel({
  signers,
  activeSignerEmail,
  fields,
  selectedFieldId,
  onAddSigner,
  onRemoveSigner,
  onSetActive,
  onAssignField,
}: SignerPanelProps) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [emailError, setEmailError] = useState("")

  const selectedField = fields.find((f) => f.id === selectedFieldId)

  function handleAdd() {
    if (!name.trim()) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email")
      return
    }
    if (signers.find((s) => s.email === email)) {
      setEmailError("Signer already added")
      return
    }
    const color = SIGNER_COLORS[signers.length % SIGNER_COLORS.length]
    onAddSigner({ email, name: name.trim(), color })
    setName("")
    setEmail("")
    setEmailError("")
    setShowForm(false)
  }

  return (
    <aside className="w-56 shrink-0 border-l border-border overflow-y-auto py-4 px-3 flex flex-col gap-4">
      {/* Signers list */}
      <div>
        <p className="text-xs font-medium text-foreground-muted uppercase tracking-wide mb-2">
          Signers
        </p>

        {signers.length === 0 && !showForm && (
          <p className="text-[11px] text-foreground-subtle leading-relaxed">
            Add at least one signer to assign fields and send for signing.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {signers.map((signer) => {
            const isActive = signer.email === activeSignerEmail
            const fieldCount = fields.filter((f) => f.assignedToEmail === signer.email).length
            return (
              <div
                key={signer.email}
                onClick={() => onSetActive(signer.email)}
                className={cn(
                  "group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-all border",
                  isActive
                    ? "border-opacity-40 bg-opacity-10"
                    : "border-transparent hover:bg-surface-raised",
                )}
                style={
                  isActive
                    ? { borderColor: `${signer.color}66`, backgroundColor: `${signer.color}18` }
                    : undefined
                }
              >
                <div
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: signer.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{signer.name}</p>
                  <p className="text-[10px] text-foreground-muted truncate">{signer.email}</p>
                  {fieldCount > 0 && (
                    <p className="text-[10px]" style={{ color: signer.color }}>
                      {fieldCount} field{fieldCount !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveSigner(signer.email)
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-subtle hover:text-error"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Add signer form */}
        {showForm ? (
          <div className="mt-2 flex flex-col gap-2">
            <Input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-xs"
            />
            <div>
              <Input
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError("") }}
                className={cn("h-7 text-xs", emailError && "border-error")}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              {emailError && <p className="text-[10px] text-error mt-1">{emailError}</p>}
            </div>
            <div className="flex gap-1">
              <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAdd}>
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setShowForm(false); setEmailError("") }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-2 flex items-center gap-1.5 text-xs text-foreground-muted hover:text-brand transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add signer
          </button>
        )}
      </div>

      {/* Active signer hint */}
      {activeSignerEmail && (
        <div className="text-[10px] text-foreground-subtle leading-relaxed border-t border-border pt-3">
          Placing fields as{" "}
          <span className="font-medium text-foreground">
            {signers.find((s) => s.email === activeSignerEmail)?.name}
          </span>
          . Click another signer to switch.
        </div>
      )}

      {/* Selected field assignment */}
      {selectedField && signers.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground-muted mb-2">Assign field to</p>
          <div className="flex flex-col gap-1">
            {signers.map((signer) => (
              <button
                key={signer.email}
                type="button"
                onClick={() => onAssignField(selectedField.id, signer.email)}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all border text-left",
                  selectedField.assignedToEmail === signer.email
                    ? "font-medium"
                    : "border-transparent hover:bg-surface-raised text-foreground-muted",
                )}
                style={
                  selectedField.assignedToEmail === signer.email
                    ? { borderColor: `${signer.color}66`, backgroundColor: `${signer.color}18`, color: signer.color }
                    : undefined
                }
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: signer.color }} />
                {signer.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No fields empty state */}
      {fields.length === 0 && signers.length > 0 && (
        <div className="border-t border-border pt-3">
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <UserCircle className="h-8 w-8 text-foreground-subtle" />
            <p className="text-[11px] text-foreground-subtle leading-relaxed">
              Click a field type on the left, then click the document to place it.
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}
