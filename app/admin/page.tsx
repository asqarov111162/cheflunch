import { LockKeyhole, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { adminIsConfigured, getAdminPasswordHash, getAdminSession, getAdminUser } from "../lib/admin";
import AdminGate from "./AdminGate";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

function AdminMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-5"><div className="w-full max-w-md rounded-[28px] border border-[#eadfd3] bg-white p-8 text-center shadow-[0_24px_70px_rgb(80_45_23/10%)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e7df] text-[#bd2b1f]"><ShieldAlert size={25} /></div><h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">{title}</h1><p className="mt-3 text-sm leading-6 text-[#81776d]">{text}</p>{action && <div className="mt-6">{action}</div>}</div></main>;
}

export default async function AdminPage() {
  if (!adminIsConfigured()) {
    return <AdminMessage title="Admin kirishi sozlanmagan" text="Vercel sozlamalarida ADMIN_EMAILS qiymatini kiriting. Masalan: sizning email manzilingiz." action={<Link href="/" className="inline-flex items-center gap-2 rounded-full bg-[#bd2b1f] px-5 py-3 text-sm font-bold text-white">Bosh sahifaga qaytish</Link>} />;
  }
  const admin = await getAdminUser();
  if (!admin) {
    return <AdminMessage title="Ruxsat yo‘q" text="Admin email manzili topilmadi. Vercel sozlamalaridagi ADMIN_EMAILS qiymatini tekshiring." action={<Link href="/" className="inline-flex items-center gap-2 rounded-full border border-[#eadfd3] bg-white px-5 py-3 text-sm font-bold text-[#20211f]"><LockKeyhole size={17} /> Bosh sahifaga qaytish</Link>} />;
  }
  const passwordHash = await getAdminPasswordHash();
  const session = await getAdminSession();
  if (!passwordHash) return <AdminGate mode="setup" email={admin.email} />;
  if (!session || session.userId !== admin.userId) return <AdminGate mode="login" email={admin.email} />;
  return <AdminPanel email={admin.email} />;
}
