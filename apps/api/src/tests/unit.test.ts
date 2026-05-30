import { describe, it, expect } from "vitest"
import { isPdf, sha256 } from "../services/document.service.js"

// ─── isPdf ────────────────────────────────────────────────────────────────────

describe("isPdf()", () => {
  it("returns true for a valid PDF magic bytes", () => {
    const buf = Buffer.from("%PDF-1.4 minimal content")
    expect(isPdf(buf)).toBe(true)
  })

  it("returns false for a JPEG (starts with FF D8 FF)", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    expect(isPdf(buf)).toBe(false)
  })

  it("returns false for a PNG (starts with 89 50 4E 47)", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(isPdf(buf)).toBe(false)
  })

  it("returns false for a ZIP (PK header)", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    expect(isPdf(buf)).toBe(false)
  })

  it("returns false for a DOCX (also ZIP internally)", () => {
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("word/")])
    expect(isPdf(buf)).toBe(false)
  })

  it("returns false for plain text", () => {
    expect(isPdf(Buffer.from("hello world"))).toBe(false)
  })

  it("returns false for empty buffer", () => {
    expect(isPdf(Buffer.alloc(0))).toBe(false)
  })

  it("returns false for buffer shorter than 4 bytes", () => {
    expect(isPdf(Buffer.from("%PD"))).toBe(false)
  })

  it("returns false for buffer with %PDF not at position 0", () => {
    expect(isPdf(Buffer.from("  %PDF-1.4"))).toBe(false)
  })
})

// ─── sha256 ───────────────────────────────────────────────────────────────────

describe("sha256()", () => {
  it("returns a 64-character hex string", () => {
    const hash = sha256(Buffer.from("hello"))
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]+$/)
  })

  it("is deterministic for the same input", () => {
    const buf = Buffer.from("sealio test content")
    expect(sha256(buf)).toBe(sha256(buf))
  })

  it("produces different hashes for different inputs", () => {
    const a = sha256(Buffer.from("document A"))
    const b = sha256(Buffer.from("document B"))
    expect(a).not.toBe(b)
  })

  it("produces different hashes for single-byte difference", () => {
    const a = sha256(Buffer.from([0x00]))
    const b = sha256(Buffer.from([0x01]))
    expect(a).not.toBe(b)
  })

  it("known SHA-256 vector: empty buffer", () => {
    // SHA-256("") = e3b0c44298fc1c149afb...
    expect(sha256(Buffer.alloc(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
  })

  it("handles large buffer (1MB) without throwing", () => {
    const big = Buffer.alloc(1024 * 1024, 0xab)
    expect(() => sha256(big)).not.toThrow()
    expect(sha256(big)).toHaveLength(64)
  })
})

// ─── Field coordinate bounds (pure logic) ─────────────────────────────────────

describe("Field bounds validation (x + width ≤ 100)", () => {
  // Mirror the Zod refinement logic from fields.ts
  function isValidField(f: { x: number; y: number; width: number; height: number }) {
    return f.x + f.width <= 100 && f.y + f.height <= 100
  }

  it("accepts field fully inside page", () => {
    expect(isValidField({ x: 10, y: 20, width: 20, height: 6 })).toBe(true)
  })

  it("accepts field touching right edge exactly", () => {
    expect(isValidField({ x: 80, y: 10, width: 20, height: 5 })).toBe(true)
  })

  it("accepts field touching bottom edge exactly", () => {
    expect(isValidField({ x: 10, y: 90, width: 20, height: 10 })).toBe(true)
  })

  it("rejects field overflowing right (x=90, width=20 → 110%)", () => {
    expect(isValidField({ x: 90, y: 10, width: 20, height: 5 })).toBe(false)
  })

  it("rejects field overflowing bottom (y=95, height=10 → 105%)", () => {
    expect(isValidField({ x: 10, y: 95, width: 20, height: 10 })).toBe(false)
  })

  it("rejects field at x=0, width=101", () => {
    expect(isValidField({ x: 0, y: 0, width: 101, height: 5 })).toBe(false)
  })

  it("accepts minimum-size checkbox at bottom-right corner", () => {
    expect(isValidField({ x: 96, y: 96, width: 4, height: 4 })).toBe(true)
  })
})

// ─── Signer color assignment (index-based) ────────────────────────────────────

describe("Signer color cycling", () => {
  const SIGNER_COLORS = ["#6ee7b7", "#93c5fd", "#fcd34d", "#f9a8d4", "#c4b5fd"]

  it("first 5 signers get unique colors", () => {
    const colors = Array.from({ length: 5 }, (_, i) => SIGNER_COLORS[i % SIGNER_COLORS.length])
    expect(new Set(colors).size).toBe(5)
  })

  it("6th signer wraps to first color (known collision)", () => {
    expect(SIGNER_COLORS[5 % SIGNER_COLORS.length]).toBe(SIGNER_COLORS[0])
  })

  it("color assignment is deterministic given index", () => {
    const idx = 3
    expect(SIGNER_COLORS[idx % SIGNER_COLORS.length]).toBe("#f9a8d4")
  })
})
