import { put } from "@vercel/blob";
import { requireAdminApi } from "../../../lib/admin";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: "Vercel Blob storage hali ulanmagan." }, { status: 503 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Rasm tanlanmagan." }, { status: 400 });
    const extension = allowedTypes.get(file.type);
    if (!extension) return Response.json({ error: "Faqat JPG, PNG yoki WEBP rasm yuklash mumkin." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return Response.json({ error: "Rasm hajmi 5 MB dan oshmasin." }, { status: 400 });
    const key = `dishes/${crypto.randomUUID()}.${extension}`;
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      cacheControlMaxAge: 31536000,
    });
    return Response.json({ success: true, key, url: blob.url }, { status: 201 });
  } catch {
    return Response.json({ error: "Rasmni saqlab bo‘lmadi." }, { status: 500 });
  }
}
