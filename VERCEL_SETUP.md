# CHEF LUNCH — Vercel sozlash

## 1. Deploy

GitHub’dan `asqarov111162/cheflunch` loyihasini import qiling. Production Branch: `main`, Root Directory: loyiha ildizi.

`vercel.json` quyidagilarni belgilaydi:

| Sozlama | Qiymat |
| --- | --- |
| Framework Preset | Next.js |
| Node.js | 24.x (package.json orqali) |
| Install Command | npm ci |
| Build Command | npm run build:vercel |
| Output Directory | .next |

Eski deployni qayta ishlatish o‘rniga yangi commitni deploy qiling. Log boshidagi commit GitHub’dagi oxirgi commitga mos bo‘lsin. Vinext bu loyihaning production buildida ishlatilmaydi.

## 2. Neon bazasini ulash — majburiy

Vercel loyihasidagi Storage/Marketplace orqali Neon PostgreSQL integratsiyasini shu loyihaga ulang yoki mavjud Neon bazangizning Connect bo‘limidan connection string oling.

Settings → Environment Variables’da kalit aynan `DATABASE_URL` bo‘lsin. Qiymati haqiqiy PostgreSQL ulanish satri, `postgresql://...` bilan boshlanadi. Uni chatga yoki GitHub’ga yubormang. Integratsiya boshqa prefiks bilan variable yaratgan bo‘lsa, `DATABASE_URL` nomiga ham kiriting.

Production muhitini tanlang. Preview deploylar uchun alohida test bazasidan foydalaning: preview orqali production buyurtmalarini o‘zgartirib yubormang.

Build vaqtida `scripts/setup-db.mjs` mavjud ma’lumotlarni o‘chirmasdan olti jadvalni yaratadi. Takroriy deploy jadvallarni yoki taomlarni tozalamaydi. `drizzle-kit push` har buildda avtomatik bajarilmaydi. Keyinchalik sxema o‘zgarsa, tekshirilgan migratsiya kerak.

`DATABASE_URL` bo‘sh bo‘lsa, sahifa builddan o‘tadi, lekin menyu/admin/buyurtmalar ishlamaydi: foydalanuvchiga sozlash zarurligi ko‘rsatiladi, checkout yopiladi. Bu ishlayotgan baza o‘rnini bosmaydi. URL bor-u ulanish ishlamasa, build xavfsiz tarzda to‘xtaydi.

## 3. Admin — majburiy

| Key | Value |
| --- | --- |
| ADMIN_EMAILS | O‘zingizning admin emailingiz |
| ADMIN_SESSION_SECRET | Kamida 32 belgili tasodifiy maxfiy satr |
| ADMIN_SETUP_KEY | Birinchi parolni yaratish uchun boshqa tasodifiy maxfiy satr, 32–256 belgi |

Tasodifiy kalitni parol menejerida yarating yoki o‘z terminalingizda quyidagi buyruqni **ikki marta** bajaring:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Har safar chiqqan boshqa-boshqa qiymatni tegishli Vercel maydoniga kiriting. Ularni chatga yubormang.

Yangi deploydan so‘ng `/admin` ga kiring. `ADMIN_SETUP_KEY` qiymatini “Sozlash kaliti” maydoniga kiriting, yangi parolni ikki marta yozing. Shu tariqa saytga tasodifan birinchi kirgan odam admin bo‘lib qolmaydi.

Keyingi kirishlarda faqat admin paroli kerak. Sozlamalar → Admin parolini almashtirish orqali uni yangilang. Almashtirish avvalgi sessiyalarni bekor qiladi. Birinchi parol yaratilgach, `ADMIN_SETUP_KEY` ni Vercel’dan olib tashlash mumkin.

`ADMIN_SESSION_SECRET` ni keyin o‘zgartirsangiz, sessiyalar bekor bo‘ladi va saqlangan Telegram tokenini qayta ulash kerak bo‘lishi mumkin. Eski SHA256 parolli o‘rnatmalarda uni admin parolini yangilamasdan o‘zgartirmang.

## 4. Rasm yuklash

Vercel Blob store yarating, **public** access tanlang va shu loyihaga ulang. Integratsiya bergan credentiallar kerak: `BLOB_STORE_ID` va Vercel OIDC, yoki `BLOB_READ_WRITE_TOKEN`. Tokenni browser kodi yoki `NEXT_PUBLIC_*` nomi bilan saqlamang.

JPG, PNG, WEBP, maksimal 4 MB. Mavjud taomning “Rasm almashtirish” tugmasi orqali yuklangan rasm avtomatik bazaga saqlanadi; narx yoki sonni qayta yozmaydi. Yangi taomda rasm yuklanishi tugagach “Taom qo‘shish”ni bosing. Yuklash xatosi forma yonida ko‘rinadi va rasm yuklanmaguncha yangi taomni qo‘shib bo‘lmaydi. Eski versiyada saqlanmay qolgan rasmlarni qayta tanlang. Katalogdan taomni o‘chirish eski Blob rasmini avtomatik o‘chirmaydi.

## 5. Telegram

BotFather orqali olingan bot tokeni va chat ID ni admin paneli → Sozlamalar → Telegram bot orqali saqlang. Avval botga `/start` yuboring, keyin **Test yuborish** tugmasini bosing.

Muqobil: `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` environment variablelari. Paneldan “Uzish” bosilsa, env qiymatlari botni qayta yoqmaydi.

Telegram ishlamasa ham buyurtma bazaga saqlanadi va admin panelida ko‘rinadi. Telegram xabari uchun avtomatik qayta yuborish navbati yo‘q; ulanishni test orqali tekshiring.

## 6. Tekshirish

1. Oxirgi commitni yangi deploy qiling. Yangi env qiymatlari mavjud deployga avtomatik qo‘llanmaydi.
2. `/admin` da parol yarating.
3. Katalogda **Toshkent vaqti bo‘yicha bugungi sanani** tanlab taom qo‘shing.
4. Bosh sahifani yangilang: faqat tanlangan kunning faol, e’lon qilingan menyusi ko‘rinadi. Demo taomlar yo‘q.
5. Sinov buyurtmasida son kamayishini tekshiring.
6. Buyurtmani bekor qiling: son bir marta qaytariladi.
7. Telegram test xabarini va rasm yuklashni tekshiring.

Oldingi Cloudflare D1 bazasi Neon’ga avtomatik ko‘chmaydi. Mavjud katalog kerak bo‘lsa, uni alohida, nazoratli migratsiya qiling; eski bazani o‘chirmang.
