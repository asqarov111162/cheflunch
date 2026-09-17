import { LockKeyhole, LogIn, ShieldAlert } from "lucide-react";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "../chatgpt-auth";
import { adminIsConfigured, getAdminPasswordHash, getAdminSession, getAdminUser } from "../lib/admin";
import AdminGate from "./AdminGate";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

function AdminMessage({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-5"><div className="w-full max-w-md rounded-[28px] border border-[#eadfd3] bg-white p-8 text-center shadow-[0_24px_70px_rgb(80_45_23/10%)]"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e7df] text-[#bd2b1f]"><ShieldAlert size={25} /></div><h1 className="mt-5 text-2xl font-black tracking-[-0.04em]">{title}</h1><p className="mt-3 text-sm leading-6 text-[#81776d]">{text}</p>{action && <div className="mt-6">{action}</div>}</div></main>;
}

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) {
    return <AdminMessage title="Admin paneliga kirish" text="Buyurtmalar va menyuni boshqarish uchun ChatGPT hisobingiz bilan kiring." action={<a href={chatGPTSignInPath("/admin")} target="_top" className="inline-flex items-center gap-2 rounded-full bg-[#20211f] px-5 py-3 text-sm font-bold text-white"><LogIn size={17} /> Kirish</a>} />;
  }
  if (!adminIsConfigured()) {
    return <AdminMessage title="Admin kirishi sozlanmagan" text="Sayt egasining email manzilini ADMIN_EMAILS sozlamasiga qo‘shish kerak. Shundan keyin admin paneli faqat ruxsat berilgan email uchun ochiladi." action={<a href="/" className="inline-flex items-center gap-2 rounded-full bg-[#bd2b1f] px-5 py-3 text-sm font-bold text-white">Bosh sahifaga qaytish</a>} />;
  }
  const admin = await getAdminUser();
  if (!admin) {
    return <AdminMessage title="Ruxsat yo‘q" text={`${user.email} adminlar ro‘yxatida yo‘q. Boshqa hisob bilan kiring yoki sayt egasidan ruxsat so‘rang.`} action={<a href={chatGPTSignOutPath("/admin")} target="_top" className="inline-flex items-center gap-2 rounded-full border border-[#eadfd3] bg-white px-5 py-3 text-sm font-bold text-[#20211f]"><LockKeyhole size={17} /> Boshqa hisob bilan kirish</a>} />;
  }
  const passwordHash = await getAdminPasswordHash();
  const session = await getAdminSession();
  if (!passwordHash) return <AdminGate mode="setup" email={admin.email} />;
  if (!session || session.userId !== admin.userId) return <AdminGate mode="login" email={admin.email} />;
  return <AdminPanel email={admin.email} />;
}
