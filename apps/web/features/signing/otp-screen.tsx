"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface OtpScreenProps {
  signerName: string
  documentTitle: string
  signerEmail: string
  onVerified: () => void
  onVerify: (otp: string) => Promise<void>
}

export function OtpScreen({ signerName, documentTitle, signerEmail, onVerified, onVerify }: OtpScreenProps) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const otp = digits.join("")

  const focusAt = useCallback((i: number) => {
    inputs.current[Math.max(0, Math.min(5, i))]?.focus()
  }, [])

  const handleChange = useCallback(
    (i: number, raw: string) => {
      const val = raw.replace(/\D/g, "").slice(-1)
      const next = [...digits]
      next[i] = val
      setDigits(next)
      setError("")
      if (val && i < 5) focusAt(i + 1)
    },
    [digits, focusAt],
  )

  const handleKeyDown = useCallback(
    (i: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace") {
        if (digits[i]) {
          const next = [...digits]
          next[i] = ""
          setDigits(next)
        } else {
          focusAt(i - 1)
        }
      } else if (e.key === "ArrowLeft") {
        focusAt(i - 1)
      } else if (e.key === "ArrowRight") {
        focusAt(i + 1)
      }
    },
    [digits, focusAt],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault()
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
      if (!pasted) return
      const next = Array(6).fill("")
      pasted.split("").forEach((c, i) => { next[i] = c })
      setDigits(next)
      setError("")
      focusAt(Math.min(pasted.length, 5))
    },
    [focusAt],
  )

  const handleSubmit = useCallback(async () => {
    if (otp.length < 6) return
    setLoading(true)
    setError("")
    try {
      await onVerify(otp)
      onVerified()
    } catch (err: any) {
      setError(err.message ?? "Verification failed")
      setDigits(Array(6).fill(""))
      focusAt(0)
    } finally {
      setLoading(false)
    }
  }, [otp, onVerify, onVerified, focusAt])

  // Auto-submit when all 6 digits filled
  useEffect(() => {
    if (otp.length === 6 && !loading) {
      handleSubmit()
    }
  }, [otp, loading, handleSubmit])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-md bg-surface rounded-2xl border border-border p-8 shadow-xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-14 w-14 rounded-2xl bg-brand-muted flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-brand" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">Verify your identity</h1>
            <p className="text-sm text-foreground-muted mt-1">
              Enter the 6-digit code sent to{" "}
              <span className="font-medium text-foreground">{signerEmail}</span>
            </p>
          </div>
        </div>

        {/* Document info */}
        <div className="bg-surface-raised rounded-lg px-4 py-3 mb-6 border border-border">
          <p className="text-xs text-foreground-muted">Document to sign</p>
          <p className="text-sm font-semibold truncate mt-0.5">{documentTitle}</p>
          <p className="text-xs text-foreground-muted mt-0.5">Signing as <span className="text-foreground font-medium">{signerName}</span></p>
        </div>

        {/* OTP boxes */}
        <div className="flex gap-2 justify-center mb-4">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              disabled={loading}
              className={cn(
                "w-11 h-14 rounded-xl border text-center text-xl font-bold transition-all outline-none",
                "bg-surface-raised text-foreground",
                d
                  ? "border-brand shadow-[0_0_0_3px_rgba(110,231,183,0.2)]"
                  : "border-border",
                "focus:border-brand focus:shadow-[0_0_0_3px_rgba(110,231,183,0.25)]",
                error && "border-error",
                loading && "opacity-50 cursor-not-allowed",
              )}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2.5 text-sm text-error mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          disabled={otp.length < 6 || loading}
          onClick={handleSubmit}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying…
            </span>
          ) : (
            "Verify & Open Document"
          )}
        </Button>

        <p className="text-center text-xs text-foreground-muted mt-4">
          Didn't receive a code? Check your spam folder or contact the sender.
        </p>
      </div>

      {/* Sealio branding */}
      <p className="mt-6 text-xs text-foreground-subtle">
        Secured by{" "}
        <span className="font-semibold text-brand">Sealio</span>
      </p>
    </div>
  )
}
