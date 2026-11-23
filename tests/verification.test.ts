import { describe, it, expect, vi, beforeEach } from "vitest";
process.env.NEXTAUTH_SECRET = "test-secret";
vi.mock("../src/lib/prisma", () => ({ prisma: {} }));
import { generateCode, hashCode, checkCode, MAX_ATTEMPTS, COOLDOWN_MS, CODE_TTL_MS } from "../src/lib/verification";
import { sendVerificationEmail, EmailSendError } from "../src/lib/email";

const row = (o = {}) => ({ codeHash: hashCode("u1", "123456"), expiresAt: new Date(Date.now() + CODE_TTL_MS), attempts: 0, usedAt: null, ...o });

describe("code generation", () => {
  it("is always 6 digits", () => { for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(/^\d{6}$/); });
  it("stores a hash, not the code", () => expect(hashCode("u1", "123456")).not.toContain("123456"));
});
describe("checkCode", () => {
  it("accepts the right code", () => expect(checkCode(row(), "u1", "123456")).toBe("ok"));
  it("rejects a wrong code", () => expect(checkCode(row(), "u1", "000000")).toBe("wrong"));
  it("rejects expired", () => expect(checkCode(row({ expiresAt: new Date(Date.now() - 1) }), "u1", "123456")).toBe("expired"));
  it("locks after max attempts even with the right code", () => expect(checkCode(row({ attempts: MAX_ATTEMPTS }), "u1", "123456")).toBe("locked"));
  it("is single-use", () => expect(checkCode(row({ usedAt: new Date() }), "u1", "123456")).toBe("used"));
});
describe("resend cooldown constant", () => it("is 60s", () => expect(COOLDOWN_MS).toBe(60_000)));
describe("Brevo (mocked)", () => {
  beforeEach(() => { process.env.BREVO_API_KEY = "k"; process.env.BREVO_SENDER_EMAIL = "a@b.c"; });
  it("posts to the Brevo endpoint with the api-key header", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", f);
    await sendVerificationEmail("s@u.edu", "Maria", "123456");
    expect(f.mock.calls[0][0]).toBe("https://api.brevo.com/v3/smtp/email");
    expect(f.mock.calls[0][1].headers["api-key"]).toBe("k");
  });
  it("throws EmailSendError on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(sendVerificationEmail("s@u.edu", "M", "123456")).rejects.toBeInstanceOf(EmailSendError);
  });
});
