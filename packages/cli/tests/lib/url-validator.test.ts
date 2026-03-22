import { describe, it, expect } from "vitest";
import { validateCaptureUrl } from "../../src/lib/url-validator.js";

describe("validateCaptureUrl", () => {
  it("正常なHTTP URLを受け付ける", () => {
    const result = validateCaptureUrl("http://example.com/page");
    expect(result.href).toBe("http://example.com/page");
  });

  it("正常なHTTPS URLを受け付ける", () => {
    const result = validateCaptureUrl("https://example.com/page");
    expect(result.href).toBe("https://example.com/page");
  });

  it("file:// プロトコルを拒否する", () => {
    expect(() => validateCaptureUrl("file:///etc/passwd")).toThrow(
      "Only HTTP/HTTPS URLs are supported",
    );
  });

  it("ftp:// プロトコルを拒否する", () => {
    expect(() => validateCaptureUrl("ftp://example.com/file")).toThrow(
      "Only HTTP/HTTPS URLs are supported",
    );
  });

  it("localhost を拒否する", () => {
    expect(() => validateCaptureUrl("http://localhost/api")).toThrow(
      "Local addresses are not allowed",
    );
  });

  it("127.0.0.1 を拒否する", () => {
    expect(() => validateCaptureUrl("http://127.0.0.1/api")).toThrow(
      "Local addresses are not allowed",
    );
  });

  it("::1 を拒否する", () => {
    expect(() => validateCaptureUrl("http://[::1]/api")).toThrow("Local addresses are not allowed");
  });

  it("0.0.0.0 を拒否する", () => {
    expect(() => validateCaptureUrl("http://0.0.0.0/api")).toThrow(
      "Local addresses are not allowed",
    );
  });

  it("10.x.x.x プライベートIPを拒否する", () => {
    expect(() => validateCaptureUrl("http://10.0.0.1/api")).toThrow(
      "Private network addresses are not allowed",
    );
  });

  it("172.16.x.x プライベートIPを拒否する", () => {
    expect(() => validateCaptureUrl("http://172.16.0.1/api")).toThrow(
      "Private network addresses are not allowed",
    );
  });

  it("192.168.x.x プライベートIPを拒否する", () => {
    expect(() => validateCaptureUrl("http://192.168.1.1/api")).toThrow(
      "Private network addresses are not allowed",
    );
  });

  it("169.254.x.x リンクローカルを拒否する", () => {
    expect(() => validateCaptureUrl("http://169.254.1.1/api")).toThrow(
      "Private network addresses are not allowed",
    );
  });

  it("不正なURLをエラーとする", () => {
    expect(() => validateCaptureUrl("not-a-url")).toThrow();
  });
});
