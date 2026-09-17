import { env } from "cloudflare:workers";
import { requireAdminApi } from "../../../lib/admin";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  if (!env.BUCKET) return Response.json({ error: "Rasm saqlash xizmati hali sozlanmagan." }, { status: 503 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Rasm tanlanmagan." }, { status: 400 });
    const extension = allowedTypes.get(file.type);
    if (!extension) return Response.json({ error: "Faqat JPG, PNG yoki WEBP rasm yuklash mumkin." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Rasm hajmi 5 MB dan oshmasin." }, { status: 400 });
    const key = `dishes/${crypto.randomUUID()}.${extension}`;
    await env.BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" },
    });
    return Response.json({ success: true, key, url: `/api/uploads/${key}` }, { status: 201 });
  } catch {
    return Response.json({ error: "Rasmni saqlab bo‘lmadi." }, { status: 500 });
  }
}
