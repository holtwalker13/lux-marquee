/**
 * Origin the *browser* should use (LAN IP, hostname, etc.).
 * Avoids Location: http://0.0.0.0:3000/... when the server binds to 0.0.0.0.
 */
export function getPublicOrigin(req: Pick<Request, "headers" | "url">): string {
  const xfHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xfHost) {
    const xfProto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "https";
    return `${xfProto}://${xfHost}`;
  }

  const host = req.headers.get("host")?.trim() ?? "";
  const isAllInterfaces = /^0\.0\.0\.0(?::\d+)?$/i.test(host);

  if (host && !isAllInterfaces) {
    let proto = "http";
    try {
      proto = new URL(req.url).protocol.replace(":", "") || "http";
    } catch {
      /* ignore */
    }
    return `${proto}://${host}`;
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      /* ignore */
    }
  }

  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function absoluteUrl(req: Pick<Request, "headers" | "url">, pathname: string): URL {
  const base = getPublicOrigin(req);
  return new URL(pathname, base.endsWith("/") ? base : `${base}/`);
}
