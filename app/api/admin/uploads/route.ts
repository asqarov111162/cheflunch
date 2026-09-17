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
    if (!file.size || file.size > 4 * 1024 * 1024) return Response.json({ error: "Rasm bo‘sh bo‘lmasin va hajmi 4 MB dan oshmasin." }, { status: 400 });
    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const matches = file.type === "image/jpeg" ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
      : file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)
      : new TextDecoder().decode(signature.slice(0, 4)) === "RIFF" && new TextDecoder().decode(signature.slice(8, 12)) === "WEBP";
    if (!matches) return Response.json({ error: "Fayl haqiqiy JPG, PNG yoki WEBP rasm emas." }, { status: 400 });
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
