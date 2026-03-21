export function validateCaptureUrl(url: string): URL {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs are supported");
  }
  const hostname = parsed.hostname.toLowerCase();
  // localhost拒否
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]" || hostname === "0.0.0.0") {
    throw new Error("Local addresses are not allowed");
  }
  // プライベートIP拒否
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) {
    throw new Error("Private network addresses are not allowed");
  }
  return parsed;
}
