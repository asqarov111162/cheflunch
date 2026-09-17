# CHEF LUNCH

Kunlik taom yetkazish sayti: o‘zbekcha (asosiy), inglizcha va ruscha interfeys; bepul yetkazish; kunlik menyu, savat va lokatsiya; parolli admin panel; katalog/rasmlar; yangi, qabul qilingan va bekor qilingan buyurtmalar; Telegram xabarlari.

## Texnologiyalar

Next.js 16, React 19, TypeScript, Tailwind CSS, Drizzle, Neon PostgreSQL, Vercel Blob. Production Node.js: 24.x.

## Mahalliy ishga tushirish

1. `npm ci`
2. `.env.example` asosida mahalliy `.env.local` faylini yarating. Haqiqiy maxfiy qiymatlarni GitHub’ga yubormang.
3. Neon test bazasi uchun `DATABASE_URL`, admin emaili va ikki maxfiy kalitni kiriting.
4. `npm run db:setup`
5. `npm run dev`

Bosh sahifa: `/`. Admin: `/admin`. Birinchi parol yaratilishida `ADMIN_SETUP_KEY` talab qilinadi.

## Tekshiruvlar

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Testlar alohida, vaqtinchalik PGlite PostgreSQL dvigatelida ishlaydi. Production bazasi, Telegram yoki Blob’ga ulanmaydi. Qamrov: lockfile, jadval yaratish, admin setup/login/sessiyalar, kunlik katalog, buyurtma validatsiyasi, son kamayishi va tranzaksiya rollback, bekor qilish, Telegram nosozligi va rasm cheklovlari.

## Vercel deploy

To‘liq ko‘rsatma: [VERCEL_SETUP.md](./VERCEL_SETUP.md).

`vercel.json`: `npm ci` → `npm run build:vercel` → `.next`.
Build bazasi mavjud bo‘lsa jadvallarni xavfsiz tayyorlaydi, keyin haqiqiy Next.js build va routes-manifestni tekshiradi. Baza ulanmasa, UI chiqishi mumkin, ammo buyurtma va admin ishlamaydi; env sozlash majburiy.

`npm run db:push` faqat ataylab sxema o‘zgartirish uchun; production build uni avtomatik bajarmaydi.

## Buyurtma qoidalari

- Faqat bugungi faol va e’lon qilingan menyudan buyurtma olinadi.
- Narx serverdan hisoblanadi, mijoz yuborgan summa ishlatilmaydi.
- Son tranzaksiyada kamayadi; yetarli mahsulot bo‘lmasa butun buyurtma bekor qilinadi.
- Bekor qilinganda qoldiq bir marta qaytariladi; bunday buyurtma qayta qabul qilinmaydi.
- Telegram xatosi saqlangan buyurtmani yo‘qotmaydi. Qayta yuborish navbati hozircha yo‘q.
