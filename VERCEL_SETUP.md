# CHEF LUNCH — Vercel sozlash

1. Vercel’da GitHub’dan `asqarov111162/cheflunch` loyihasini import qiling. `Framework Preset` — **Next.js** bo‘lsin. `vercel.json` build buyruqlarini o‘zi qo‘llaydi.
2. Neon integratsiyasini ulang. U `DATABASE_URL` ni avtomatik beradi.
3. Vercel Blob store yarating va shu loyihaga ulang. Rasm yuklash uchun Blob store **public** bo‘lishi kerak.
4. Environment Variables’ga quyidagilarni qo‘shing:

   - `ADMIN_EMAILS` — admin email manzili
   - `ADMIN_SESSION_SECRET` — uzun tasodifiy maxfiy satr
   - `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` — ixtiyoriy; ularni keyin admin panelidan ham kiritish mumkin

5. Redeploy qiling. `db:push` yangi Neon bazasida jadvallarni yaratadi.
6. Saytda `/admin` manziliga kiring. Birinchi kirishda admin parolini yarating.

Eski Cloudflare D1 katalogi yangi Neon bazasiga avtomatik ko‘chmaydi. Vercel ishga tushgach, taomlarni admin panelidagi **Katalog va menyu** bo‘limidan qayta qo‘shish mumkin.
