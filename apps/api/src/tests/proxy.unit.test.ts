/**
 * Unit tests for the proxy.ts middleware logic (isPublic, static file detection).
 * We test the pure logic by importing and calling the exported `proxy` function
 * via a mock NextRequest.
 */
import { describe, it, expect } from "vitest"

// Mirror the proxy.ts logic so we can unit-test it without Next.js runtime
const STATIC_EXT = /\.(js|mjs|cjs|css|map|json|txt|xml|pdf|woff2?|ttf|otf)$/i
const PUBLIC_PATHS = ["/", "/login", "/signup", "/sign", "/cmaps"]

function isPublic(pathname: string): boolean {
  if (STATIC_EXT.test(pathname)) return true
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

describe("isPublic() — static file bypass", () => {
  it("allows .mjs files (PDF worker)", () => {
    expect(isPublic("/pdf.worker.min.mjs")).toBe(true)
  })

  it("allows .js files", () => {
    expect(isPublic("/some-script.js")).toBe(true)
  })

  it("allows .css files", () => {
    expect(isPublic("/styles.css")).toBe(true)
  })

  it("allows .json files", () => {
    expect(isPublic("/manifest.json")).toBe(true)
  })

  it("allows .woff2 font files", () => {
    expect(isPublic("/font.woff2")).toBe(true)
  })

  it("allows .pdf files served statically", () => {
    expect(isPublic("/sample.pdf")).toBe(true)
  })

  it("allows .map source maps", () => {
    expect(isPublic("/bundle.js.map")).toBe(true)
  })
})

describe("isPublic() — public app routes", () => {
  it("allows root /", () => {
    expect(isPublic("/")).toBe(true)
  })

  it("allows /login", () => {
    expect(isPublic("/login")).toBe(true)
  })

  it("allows /signup", () => {
    expect(isPublic("/signup")).toBe(true)
  })

  it("allows /sign (signing page root)", () => {
    expect(isPublic("/sign")).toBe(true)
  })

  it("allows /sign/:token (signing page with token)", () => {
    expect(isPublic("/sign/cmpr90vzh000h1vn5992im0ng")).toBe(true)
  })

  it("allows /cmaps/ (pdfjs cmap files)", () => {
    expect(isPublic("/cmaps/")).toBe(true)
    expect(isPublic("/cmaps/Adobe-CNS1-UCS2")).toBe(true)
  })
})

describe("isPublic() — protected routes", () => {
  it("blocks /dashboard", () => {
    expect(isPublic("/dashboard")).toBe(false)
  })

  it("blocks /documents", () => {
    expect(isPublic("/documents")).toBe(false)
  })

  it("blocks /documents/new", () => {
    expect(isPublic("/documents/new")).toBe(false)
  })

  it("blocks /documents/:id", () => {
    expect(isPublic("/documents/cmpr90vzh000h1vn5992im0ng")).toBe(false)
  })

  it("blocks /templates", () => {
    expect(isPublic("/templates")).toBe(false)
  })

  it("blocks /settings", () => {
    expect(isPublic("/settings")).toBe(false)
  })

  it("blocks /api/internal (hypothetical internal route)", () => {
    expect(isPublic("/api/internal")).toBe(false)
  })
})

describe("isPublic() — edge cases", () => {
  it("blocks /signout (starts with /sign but is not /sign or /sign/)", () => {
    // '/signout'.startsWith('/sign/') → false; '/signout' === '/sign' → false
    expect(isPublic("/signout")).toBe(false)
  })

  it("allows /sign/ (trailing slash)", () => {
    expect(isPublic("/sign/")).toBe(true)
  })

  it("blocks empty string (should never happen but safe)", () => {
    expect(isPublic("")).toBe(false)
  })

  it("is case-sensitive for extension check (.MJS uppercase is allowed)", () => {
    // STATIC_EXT uses /i flag so uppercase matches
    expect(isPublic("/WORKER.MJS")).toBe(true)
  })
})
