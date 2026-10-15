const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

function setCookiesFrom(headers: Headers): string[] {
  const withGet = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGet.getSetCookie === "function") return withGet.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

export async function POST(request: Request): Promise<Response> {
  let body = "{}";
  try {
    body = await request.text();
  } catch {
    // keep the fallback body so Django still returns its validation error
  }

  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body,
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

  const payload = await upstream.text();
  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    "Cache-Control": "no-store",
  });
  for (const setCookie of setCookiesFrom(upstream.headers)) {
    headers.append("set-cookie", setCookie);
  }

  return new Response(payload, { status: upstream.status, headers });
}
