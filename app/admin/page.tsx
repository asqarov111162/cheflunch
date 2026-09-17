import { LockKeyhole, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { adminConfigurationError, getAdminPasswordHash, getAdminSession, getAdminUser } from "../lib/admin";
import { publicError } from "../lib/errors";
import AdminGate from "./AdminGate";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

function AdminMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-5"><div className="w-full max-w-md rounded-[28px] border border-[#eadfd3] bg-white p-8 text-center shadow-[0_24px_70px_rgb(80_45_23/10%)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e7df] text-[#bd2b1f]"><ShieldAlert size={25} /></div><h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">{title}</h1><p className="mt-3 text-sm leading-6 text-[#81776d]">{text}</p>{action && <div className="mt-6">{action}</div>}</div></main>;
}

export default async function AdminPage() {
  const configurationError = adminConfigurationError();
  if (configurationError) {
    return <AdminMessage title="Sayt sozlamalari kerak" text={configurationError} action={<Link href="/" className="inline-flex items-center gap-2 rounded-full bg-[#bd2b1f] px-5 py-3 text-sm font-bold text-white">Bosh sahifaga qaytish</Link>} />;
  }
  const admin = await getAdminUser();
  if (!admin) {
    return <AdminMessage title="Ruxsat yo‘q" text="Admin email manzili topilmadi. Vercel sozlamalaridagi ADMIN_EMAILS qiymatini tekshiring." action={<Link href="/" className="inline-flex items-center gap-2 rounded-full border border-[#eadfd3] bg-white px-5 py-3 text-sm font-bold text-[#20211f]"><LockKeyhole size={17} /> Bosh sahifaga qaytish</Link>} />;
  }
  let passwordHash;
  let session;
  try {
    passwordHash = await getAdminPasswordHash();
    if (passwordHash) session = await getAdminSession();
  } catch (error) {
    return <AdminMessage title="Admin panel vaqtincha ochilmayapti" text={publicError(error, "Bazaga ulanib bo‘lmadi. Neon va DATABASE_URL sozlamasini tekshiring.").error} />;
  }
  if (!passwordHash && (!process.env.ADMIN_SETUP_KEY || process.env.ADMIN_SETUP_KEY.length < 32)) {
    return <AdminMessage title="Adminni xavfsiz sozlash" text="Vercel’da ADMIN_SETUP_KEY uchun kamida 32 belgili tasodifiy maxfiy kalit kiriting va qayta deploy qiling. Bu kalit faqat birinchi parol yaratishda kerak." />;
  }
  if (!passwordHash) return <AdminGate mode="setup" />;
  if (!session || session.userId !== admin.userId) return <AdminGate mode="login" />;
  return <AdminPanel email={admin.email} />;
}
