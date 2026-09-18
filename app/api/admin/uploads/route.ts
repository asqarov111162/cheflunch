import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { dishes } from "../../../../db/schema";
import { requireAdminApi } from "../../../lib/admin";
import { AppError, errorResponse } from "../../../lib/errors";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request) {
  const access = await requireAdminApi(request);
  if (access.response) return access.response;
  if (!process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    return errorResponse(new AppError("Rasm saqlash uchun Vercel Blob public omborini loyihaga ulang va qayta deploy qiling.", 503, "IMAGE_STORAGE_NOT_CONFIGURED"));
  }
  try {
    const form = await request.formData();
    const target = form.get("dishId");
    const dishId = target === null ? null : Number(target);
    if (target !== null && (typeof target !== "string" || !/^\d+$/.test(target) || !Number.isSafeInteger(dishId) || dishId === null || dishId <= 0)) {
      throw new AppError("Taom raqami noto‘g‘ri.");
    }
    if (dishId !== null) {
      const [dish] = await getDb().select({ id: dishes.id }).from(dishes).where(eq(dishes.id, dishId));
      if (!dish) throw new AppError("Taom topilmadi. Katalogni yangilang.", 404);
    }
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
      abortSignal: AbortSignal.timeout(20_000),
    }).catch(() => {
      throw new AppError("Rasm yuklanmadi. Vercel Blob ulanishi va omborning Public sozlamasini tekshiring.", 503, "IMAGE_STORAGE_UNAVAILABLE");
    });
    if (dishId !== null) {
      // Persist only the image: never overwrite stock or other unsaved edits.
      const [updated] = await getDb().update(dishes)
        .set({ imageUrl: blob.url, updatedAt: new Date().toISOString() })
        .where(eq(dishes.id, dishId)).returning({ id: dishes.id });
      if (!updated) throw new AppError("Taom topilmadi. Katalogni yangilang.", 404);
    }
    return Response.json({ success: true, key, url: blob.url, dishId, saved: dishId !== null }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Rasmni taomga saqlab bo‘lmadi. Qayta urinib ko‘ring.");
  }
}
