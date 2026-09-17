import { env } from "cloudflare:workers";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  if (!env.BUCKET) return new Response("Image storage unavailable", { status: 503 });
  const { key } = await context.params;
  const object = await env.BUCKET.get(key.join("/"));
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  headers.set("cache-control", object.httpMetadata?.cacheControl || "public, max-age=31536000, immutable");
  headers.set("content-type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
}
