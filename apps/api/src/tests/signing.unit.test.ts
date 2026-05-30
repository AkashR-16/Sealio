import { describe, it, expect } from "vitest"
import { generateOtp, hashOtp, verifyOtpHash, OTP_TTL_MS, OTP_MAX_ATTEMPTS } from "../services/signing.service.js"

describe("generateOtp()", () => {
  it("returns a 6-character string", () => {
    expect(generateOtp()).toHaveLength(6)
  })

  it("only contains digits", () => {
    expect(generateOtp()).toMatch(/^\d{6}$/)
  })

  it("pads low values to 6 digits (e.g. 000042)", () => {
    // Run many times to reduce flakiness — statistically we will see small values
    const otps = Array.from({ length: 200 }, generateOtp)
    expect(otps.every((o) => /^\d{6}$/.test(o))).toBe(true)
  })

  it("produces different values across calls (probabilistic)", () => {
    const set = new Set(Array.from({ length: 20 }, generateOtp))
    expect(set.size).toBeGreaterThan(1)
  })
})

describe("hashOtp() + verifyOtpHash()", () => {
  it("hash round-trips correctly", async () => {
    const otp = "123456"
    const h = await hashOtp(otp)
    expect(await verifyOtpHash(otp, h)).toBe(true)
  })

  it("wrong OTP returns false", async () => {
    const h = await hashOtp("999999")
    expect(await verifyOtpHash("111111", h)).toBe(false)
  })

  it("hash is different from the plaintext OTP", async () => {
    const otp = "000000"
    const h = await hashOtp(otp)
    expect(h).not.toBe(otp)
  })

  it("two hashes of the same OTP differ (bcrypt salt)", async () => {
    const otp = "654321"
    const h1 = await hashOtp(otp)
    const h2 = await hashOtp(otp)
    expect(h1).not.toBe(h2)
    expect(await verifyOtpHash(otp, h1)).toBe(true)
    expect(await verifyOtpHash(otp, h2)).toBe(true)
  })
})

describe("OTP constants", () => {
  it("TTL is 10 minutes in milliseconds", () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000)
  })

  it("max attempts is 3", () => {
    expect(OTP_MAX_ATTEMPTS).toBe(3)
  })
})
