import { NextRequest } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

function setCookiesFrom(headers: Headers): string[] {
  const withGet = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGet.getSetCookie === "function") return withGet.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export async function GET(request: NextRequest): Promise<Response> {
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const search = request.nextUrl.search;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/chat/events${search}`, {
      method: "GET",
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "The assistant is unreachable right now." }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (upstream.status !== 200 || contentType.includes("json")) {
    // Ownership errors / validation failures come back as JSON before the
    // stream starts. Relay JSON verbatim; anything else stays generic.
    const text = await upstream.text();
    let payload = text;
    try {
      if (text.trim()) JSON.parse(text);
      else throw new Error("empty body");
    } catch {
      payload = JSON.stringify({
        error: "The chat stream could not be reached right now.",
      });
    }
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    for (const setCookie of setCookiesFrom(upstream.headers)) {
      headers.append("set-cookie", setCookie);
    }
    return new Response(payload, { status: upstream.status, headers });
  }

  const headers = new Headers({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });
  for (const setCookie of setCookiesFrom(upstream.headers)) {
    headers.append("set-cookie", setCookie);
  }
  return new Response(upstream.body, { status: 200, headers });
}