import { describe, it, expect } from "vitest";
import { isAllowedUrl } from "./url-guard";

describe("isAllowedUrl", () => {
  it("permite vercel.com sobre https", () => {
    expect(isAllowedUrl("https://vercel.com/changelog")).toBe(true);
  });

  it("permite subdominios de vercel.com", () => {
    expect(isAllowedUrl("https://www.vercel.com/docs")).toBe(true);
  });

  it("permite t.co", () => {
    expect(isAllowedUrl("https://t.co/abc")).toBe(true);
  });

  it("permite x.com", () => {
    expect(isAllowedUrl("https://x.com/vercel/status/1")).toBe(true);
  });

  it("permite mayúsculas y punto final (case + trailing dot)", () => {
    expect(isAllowedUrl("https://VERCEL.COM./docs")).toBe(true);
  });

  it("rechaza http", () => {
    expect(isAllowedUrl("http://vercel.com")).toBe(false);
  });

  it("rechaza hosts ajenos", () => {
    expect(isAllowedUrl("https://evil.com")).toBe(false);
  });

  it("rechaza sufijos engañosos", () => {
    expect(isAllowedUrl("https://vercel.com.evil.com")).toBe(false);
  });

  it("rechaza IP literal loopback", () => {
    expect(isAllowedUrl("https://127.0.0.1/")).toBe(false);
  });

  it("rechaza endpoint de metadata", () => {
    expect(isAllowedUrl("https://169.254.169.254/latest")).toBe(false);
  });

  it("rechaza strings que no son URL", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
  });
});
