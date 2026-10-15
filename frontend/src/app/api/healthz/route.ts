const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(`${BACKEND_URL}/healthz`, { cache: "no-store" });
    return new Response(JSON.stringify({ ok: upstream.ok }), {
      status: upstream.ok ? 200 : 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}