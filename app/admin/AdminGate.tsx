"use client";

import { KeyRound, LoaderCircle, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";

const inputClass = "h-12 w-full rounded-2xl border border-[#e3d6c8] bg-[#fffaf4] px-4 text-sm outline-none focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10";

export default function AdminGate({ mode }: { mode: "setup" | "login" }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isSetup = mode === "setup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (isSetup && password !== confirmation) {
      setError("Parollar bir xil emas.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: isSetup ? "setup" : "login", password, ...(isSetup ? { setupKey } : {}) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Kirish amalga oshmadi.");
      window.location.reload();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Kirish amalga oshmadi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fffaf4] px-5">
      <div className="w-full max-w-md rounded-[28px] border border-[#eadfd3] bg-white p-8 shadow-[0_24px_70px_rgb(80_45_23/10%)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e7df] text-[#bd2b1f]"><LockKeyhole size={25} /></div>
        <div className="mt-5 text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#bd2b1f]">CHEF LUNCH</p>
          <h1 className="mt-2 text-2xl font-black tracking-[-0.04em]">{isSetup ? "Admin parolini yarating" : "Admin paneliga kirish"}</h1>
          <p className="mt-3 text-sm leading-6 text-[#81776d]">{isSetup ? "Vercel’da belgilagan sozlash kalitingizni kiriting va admin parolini yarating." : "Katalog va buyurtmalarni boshqarish uchun admin parolingizni kiriting."}</p>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {isSetup && <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#706b64]">Sozlash kaliti (ADMIN_SETUP_KEY)</span>
            <input required minLength={32} maxLength={256} autoComplete="off" type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} className={inputClass} />
          </label>}
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#706b64]">{isSetup ? "Yangi parol" : "Admin paroli"}</span>
            <div className="relative">
              <KeyRound size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a39a90]" />
              <input required minLength={8} maxLength={120} autoComplete={isSetup ? "new-password" : "current-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass + " pl-11"} placeholder="Kamida 8 ta belgi" />
            </div>
          </label>
          {isSetup && <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#706b64]">Parolni tasdiqlang</span>
            <input required minLength={8} maxLength={120} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={inputClass} placeholder="Parolni qayta kiriting" />
          </label>}
          {error && <p role="alert" className="rounded-xl bg-[#fff0ed] px-3 py-2.5 text-xs font-semibold text-[#a92118]">{error}</p>}
          <button type="submit" disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#bd2b1f] text-sm font-black text-white transition hover:bg-[#a92118] disabled:opacity-60">
            {saving && <LoaderCircle size={17} className="animate-spin" />}{isSetup ? "Parolni saqlash" : "Kirish"}
          </button>
        </form>
      </div>
    </main>
  );
}
