"use client";

import {
  Check,
  ClipboardList,
  ImagePlus,
  KeyRound,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { defaultSiteSettings, type SiteSettings } from "../lib/site-settings";
import { formatPrice, todayInTashkent } from "../lib/catalog";

type AdminDish = {
  id: number;
  nameUz: string;
  nameEn: string;
  nameRu: string;
  descriptionUz: string;
  descriptionEn: string;
  descriptionRu: string;
  price: number;
  quantity: number;
  imageUrl: string;
  emoji: string;
  isActive: boolean;
  inMenu: boolean;
};

type NewDish = Omit<AdminDish, "id" | "isActive" | "inMenu">;

type AdminOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  phone: string;
  address: string;
  locationUrl: string;
  note: string;
  total: number;
  status: string;
  createdAt: string;
  items: Array<{ id: number; dishName: string; quantity: number; subtotal: number }>;
};

type Tab = "orders" | "catalog" | "settings";

const blankDish: NewDish = {
  nameUz: "",
  nameEn: "",
  nameRu: "",
  descriptionUz: "",
  descriptionEn: "",
  descriptionRu: "",
  price: 0,
  quantity: 0,
  imageUrl: "",
  emoji: "🍱",
};

const fieldClass = "h-11 w-full rounded-xl border border-[#e3d6c8] bg-[#fffaf4] px-3 text-sm font-semibold outline-none transition focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10";
const darkFieldClass = "h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm outline-none placeholder:text-white/45 focus:border-[#f2b36e]";

function TextField({ label, value, onChange, dark = false }: { label: string; value: string; onChange: (value: string) => void; dark?: boolean }) {
  return <label className="block"><span className={`mb-1.5 block text-xs font-bold ${dark ? "text-white/65" : "text-[#706b64]"}`}>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className={dark ? darkFieldClass : fieldClass} /></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20 w-full resize-y rounded-xl border border-[#e3d6c8] bg-[#fffaf4] px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10" /></label>;
}

export default function AdminPanel({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [date, setDate] = useState(todayInTashkent());
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [dishes, setDishes] = useState<AdminDish[]>([]);
  const [newDish, setNewDish] = useState<NewDish>(blankDish);
  const [settings, setSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | "new" | "settings" | "telegram" | "password" | "test" | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const pending = useMemo(() => orders.filter((order) => order.status === "new").length, [orders]);

  async function loadOrders() {
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    const payload = await response.json() as { error?: string; orders?: AdminOrder[] };
    if (!response.ok) throw new Error(payload.error || "Buyurtmalar yuklanmadi");
    setOrders(payload.orders ?? []);
  }

  async function loadCatalog(selectedDate = date) {
    const response = await fetch(`/api/admin/catalog?date=${selectedDate}`, { cache: "no-store" });
    const payload = await response.json() as { error?: string; dishes?: AdminDish[] };
    if (!response.ok) throw new Error(payload.error || "Katalog yuklanmadi");
    setDishes(payload.dishes ?? []);
  }

  async function loadSettings() {
    const response = await fetch("/api/admin/settings", { cache: "no-store" });
    const payload = await response.json() as { error?: string; settings?: SiteSettings; telegram?: { configured: boolean; chatId: string } };
    if (!response.ok) throw new Error(payload.error || "Sozlamalar yuklanmadi");
    setSettings(payload.settings ?? defaultSiteSettings);
    setTelegramConfigured(Boolean(payload.telegram?.configured));
    setTelegramChatId(payload.telegram?.chatId ?? "");
  }

  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      await Promise.all([loadOrders(), loadCatalog(), loadSettings()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ma’lumotlarni yuklab bo‘lmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function updateOrder(id: number, status: "accepted" | "cancelled") {
    setSaving(id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Buyurtma yangilanmadi");
      await loadOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Buyurtma yangilanmadi");
    } finally {
      setSaving(null);
    }
  }

  async function toggleMenu(dish: AdminDish) {
    setSaving(dish.id);
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "toggle-menu", dishId: dish.id, date, enabled: !dish.inMenu }) });
      const payload = await response.json() as { error?: string; inMenu?: boolean };
      if (!response.ok) throw new Error(payload.error || "Menyu yangilanmadi");
      setDishes((current) => current.map((item) => item.id === dish.id ? { ...item, inMenu: Boolean(payload.inMenu) } : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Menyu yangilanmadi");
    } finally {
      setSaving(null);
    }
  }

  async function saveDish(dish: AdminDish) {
    setSaving(dish.id);
    try {
      const response = await fetch("/api/admin/catalog", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(dish) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Taom saqlanmadi");
      setMessage("Taom ma’lumotlari saqlandi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Taom saqlanmadi");
    } finally {
      setSaving(null);
    }
  }

  async function deleteDish(id: number) {
    if (!window.confirm("Bu taom katalogdan va barcha kunlik menyulardan o‘chirilsinmi?")) return;
    setSaving(id);
    try {
      const response = await fetch(`/api/admin/catalog?id=${id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Taom o‘chirilmadi");
      setDishes((current) => current.filter((dish) => dish.id !== id));
      setMessage("Taom o‘chirildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Taom o‘chirilmadi");
    } finally {
      setSaving(null);
    }
  }

  async function createDish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("new");
    try {
      const response = await fetch("/api/admin/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...newDish, date }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Taom qo‘shilmadi");
      setNewDish(blankDish);
      await loadCatalog();
      setMessage("Yangi taom katalogga qo‘shildi va tanlangan kun menyusiga chiqarildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Taom qo‘shilmadi");
    } finally {
      setSaving(null);
    }
  }

  function updateDish(id: number, key: keyof AdminDish, value: string | number | boolean) {
    setDishes((current) => current.map((dish) => dish.id === id ? { ...dish, [key]: value } : dish));
  }

  async function uploadImage(file: File, target: "new" | number) {
    setUploading(String(target));
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/uploads", { method: "POST", body: form });
      const payload = await response.json() as { error?: string; url?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || "Rasm yuklanmadi");
      if (target === "new") setNewDish((current) => ({ ...current, imageUrl: payload.url || "" }));
      else updateDish(target, "imageUrl", payload.url);
      setMessage("Rasm yuklandi. Taomni saqlashni unutmang.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rasm yuklanmadi");
    } finally {
      setUploading(null);
    }
  }

  function updateSetting(key: keyof SiteSettings, value: string | boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSiteSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("settings");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "site", settings }) });
      const payload = await response.json() as { error?: string; settings?: SiteSettings };
      if (!response.ok) throw new Error(payload.error || "Sayt sozlamalari saqlanmadi");
      if (payload.settings) setSettings(payload.settings);
      setMessage("Sayt sozlamalari saqlandi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sayt sozlamalari saqlanmadi");
    } finally {
      setSaving(null);
    }
  }

  async function saveTelegram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("telegram");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "telegram", botToken: telegramToken, chatId: telegramChatId }) });
      const payload = await response.json() as { error?: string; telegram?: { configured: boolean; chatId: string } };
      if (!response.ok) throw new Error(payload.error || "Telegram sozlanmadi");
      setTelegramConfigured(Boolean(payload.telegram?.configured));
      setTelegramChatId(payload.telegram?.chatId ?? telegramChatId);
      setTelegramToken("");
      setMessage("Telegram bot ulandi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Telegram sozlanmadi");
    } finally {
      setSaving(null);
    }
  }

  async function testTelegram() {
    setSaving("test");
    try {
      const response = await fetch("/api/admin/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test-telegram" }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Test xabari yuborilmadi");
      setMessage("Test xabari Telegramga yuborildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Telegram testida xatolik");
    } finally {
      setSaving(null);
    }
  }

  async function disconnectTelegram() {
    if (!window.confirm("Telegram bot ulanishi uzilsinmi?")) return;
    setSaving("telegram");
    try {
      const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "telegram", disconnect: true }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Telegram uzilmadi");
      setTelegramConfigured(false);
      setTelegramChatId("");
      setTelegramToken("");
      setMessage("Telegram bot uzildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Telegram uzilmadi");
    } finally {
      setSaving(null);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage("Yangi parollar bir xil emas.");
      return;
    }
    setSaving("password");
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "change-password", currentPassword, newPassword }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Parol almashtirilmadi");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Admin paroli almashtirildi.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Parol almashtirilmadi");
    } finally {
      setSaving(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    window.location.href = "/admin";
  }

  return <main className="min-h-screen bg-[#f7f0e8] text-[#20211f]"><header className="sticky top-0 z-20 border-b border-[#eadfd3] bg-[#fffaf4]/95 backdrop-blur-xl"><div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-10"><a href="/" className="flex items-center gap-3"><div className="h-10 w-10 overflow-hidden rounded-xl border border-[#eadfd3] bg-white"><img src="/logo.png" alt="CHEF LUNCH" className="h-full w-full object-cover" /></div><div><p className="text-sm font-black tracking-[0.08em]">CHEF LUNCH</p><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#bd2b1f]">Admin panel</p></div></a><div className="flex items-center gap-2"><span className="hidden text-xs text-[#81776d] lg:inline">{email}</span><a href="/" className="rounded-full border border-[#eadfd3] bg-white px-4 py-2 text-xs font-bold text-[#706b64] transition hover:text-[#bd2b1f]">Saytni ko‘rish</a><button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-full bg-[#20211f] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#bd2b1f]"><LogOut size={14} /> Chiqish</button></div></div></header><div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10"><div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#bd2b1f]">CHEF LUNCH boshqaruvi</p><h1 className="mt-2 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Admin markazi</h1><p className="mt-2 text-sm text-[#81776d]">Buyurtmalar, kunlik menyu, katalog va sayt sozlamalarini bir joyda boshqaring.</p></div><button type="button" onClick={() => void refresh()} className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-[#eadfd3] bg-white px-4 py-2.5 text-sm font-bold text-[#706b64] transition hover:border-[#bd2b1f] hover:text-[#bd2b1f] lg:self-auto"><RefreshCw size={16} /> Yangilash</button></div><div className="mb-6 grid gap-4 sm:grid-cols-3"><div className="rounded-3xl border border-[#eadfd3] bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#a39a90]">Yangi buyurtmalar</p><p className="mt-2 text-3xl font-black text-[#bd2b1f]">{pending}</p></div><div className="rounded-3xl border border-[#eadfd3] bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#a39a90]">Katalogdagi taomlar</p><p className="mt-2 text-3xl font-black">{dishes.length}</p></div><div className="rounded-3xl border border-[#eadfd3] bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#a39a90]">Bugungi menyu</p><p className="mt-2 text-3xl font-black text-[#547b56]">{dishes.filter((dish) => dish.inMenu).length}</p></div></div><div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-[#eadfd3] bg-white p-1.5"><button type="button" onClick={() => setTab("orders")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === "orders" ? "bg-[#20211f] text-white" : "text-[#81776d] hover:text-[#20211f]"}`}><ClipboardList size={17} /> Buyurtmalar {pending > 0 && <span className="rounded-full bg-[#bd2b1f] px-1.5 py-0.5 text-[10px] text-white">{pending}</span>}</button><button type="button" onClick={() => setTab("catalog")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === "catalog" ? "bg-[#20211f] text-white" : "text-[#81776d] hover:text-[#20211f]"}`}><LayoutGrid size={17} /> Katalog va menyu</button><button type="button" onClick={() => setTab("settings")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === "settings" ? "bg-[#20211f] text-white" : "text-[#81776d] hover:text-[#20211f]"}`}><Settings size={17} /> Sayt sozlamalari</button></div>{message && <div className="mb-5 rounded-2xl border border-[#eadfd3] bg-[#fff8de] px-4 py-3 text-sm font-semibold text-[#795d1c]">{message}</div>}{loading ? <div className="flex min-h-64 items-center justify-center rounded-3xl border border-[#eadfd3] bg-white"><LoaderCircle className="animate-spin text-[#bd2b1f]" /></div> : tab === "orders" ? <section className="space-y-4">{orders.length ? orders.map((order) => <article key={order.id} className="rounded-3xl border border-[#eadfd3] bg-white p-5 shadow-[0_10px_30px_rgb(80_45_23/4%)] sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-black">#{order.orderNumber}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${order.status === "new" ? "bg-[#fff0ed] text-[#bd2b1f]" : order.status === "accepted" ? "bg-[#e5f0e4] text-[#2f6142]" : "bg-[#f1ece8] text-[#81776d]"}`}>{order.status === "new" ? "Yangi" : order.status === "accepted" ? "Qabul qilindi" : "Bekor qilindi"}</span></div><p className="mt-2 text-sm font-bold">{order.customerName} · {order.phone}</p><p className="mt-1 text-sm text-[#81776d]">{order.address}</p>{order.locationUrl && <a href={order.locationUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-bold text-[#bd2b1f] hover:underline">Lokatsiyani ochish</a>}</div><div className="text-left sm:text-right"><p className="text-xl font-black">{formatPrice(order.total)}</p><p className="mt-1 text-xs text-[#a39a90]">{new Date(order.createdAt).toLocaleString("uz-UZ")}</p></div></div><div className="mt-5 grid gap-2 border-t border-[#f0e6dc] pt-4 sm:grid-cols-2">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-[#f8f0e7] px-3 py-2 text-sm"><span className="font-semibold">{item.dishName} × {item.quantity}</span><span className="font-bold text-[#bd2b1f]">{formatPrice(item.subtotal)}</span></div>)}</div>{order.note && <p className="mt-4 rounded-xl bg-[#f7f0e8] px-3 py-2 text-xs text-[#706b64]">Izoh: {order.note}</p>}{order.status === "new" && <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={saving === order.id} onClick={() => void updateOrder(order.id, "accepted")} className="inline-flex items-center gap-2 rounded-full bg-[#2f6142] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#244b38] disabled:opacity-60"><Check size={16} /> Qabul qilish</button><button type="button" disabled={saving === order.id} onClick={() => void updateOrder(order.id, "cancelled")} className="inline-flex items-center gap-2 rounded-full border border-[#efc4bc] bg-[#fff6f4] px-4 py-2.5 text-sm font-bold text-[#bd2b1f] transition hover:bg-[#fff0ed] disabled:opacity-60"><X size={16} /> Bekor qilish</button></div>}</article>) : <div className="rounded-3xl border border-dashed border-[#d7c8bb] bg-white px-6 py-16 text-center"><ClipboardList className="mx-auto text-[#bd2b1f]" /><h2 className="mt-4 text-xl font-black">Hozircha buyurtmalar yo‘q</h2><p className="mt-2 text-sm text-[#81776d]">Yangi buyurtmalar shu yerda ko‘rinadi.</p></div>}</section> : tab === "catalog" ? <section><div className="mb-5 flex flex-col justify-between gap-3 rounded-3xl border border-[#eadfd3] bg-white p-5 sm:flex-row sm:items-center"><div><p className="text-sm font-black">Qaysi kun menyusini tuzamiz?</p><p className="mt-1 text-xs text-[#81776d]">Katalogdagi taomni tanlab, shu kunga qo‘shing.</p></div><input type="date" value={date} onChange={(event) => { setDate(event.target.value); void loadCatalog(event.target.value); }} className={fieldClass} /></div><div className="grid gap-4 lg:grid-cols-[0.78fr_1.22fr]"><form onSubmit={createDish} className="rounded-3xl border border-[#eadfd3] bg-[#20211f] p-5 text-white sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-[#f2b36e]">Yangi taom</p><h2 className="mt-1 text-xl font-black">Katalogga qo‘shish</h2></div><Plus className="text-[#f2b36e]" size={22} /></div><div className="mt-5 space-y-3"><TextField dark label="Taom nomi (o‘zbekcha)" value={newDish.nameUz} onChange={(value) => setNewDish({ ...newDish, nameUz: value })} /><TextField dark label="Taom nomi (English)" value={newDish.nameEn} onChange={(value) => setNewDish({ ...newDish, nameEn: value })} /><TextField dark label="Taom nomi (Русский)" value={newDish.nameRu} onChange={(value) => setNewDish({ ...newDish, nameRu: value })} /><label className="block"><span className="mb-1.5 block text-xs font-bold text-white/65">O‘zbekcha ma’lumot</span><textarea value={newDish.descriptionUz} onChange={(event) => setNewDish({ ...newDish, descriptionUz: event.target.value })} className={`${darkFieldClass} min-h-20 resize-y py-2.5`} /></label><div className="grid grid-cols-2 gap-2"><input required type="number" min="1" value={newDish.price || ""} onChange={(event) => setNewDish({ ...newDish, price: Number(event.target.value) })} placeholder="Narxi" className={darkFieldClass} /><input type="number" min="0" value={newDish.quantity || ""} onChange={(event) => setNewDish({ ...newDish, quantity: Number(event.target.value) })} placeholder="Soni" className={darkFieldClass} /></div><div className="grid grid-cols-[1fr_auto] gap-2"><input value={newDish.emoji} onChange={(event) => setNewDish({ ...newDish, emoji: event.target.value })} className={`${darkFieldClass} text-center text-xl`} aria-label="Taom belgisi" /><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-bold text-white transition hover:bg-white/20"><Upload size={15} /> {uploading === "new" ? "Yuklanmoqda" : "Rasm tanlash"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, "new"); }} /></label></div>{newDish.imageUrl && <img src={newDish.imageUrl} alt="Yangi taom rasmi" className="h-36 w-full rounded-2xl object-cover" />}<button type="submit" disabled={saving === "new"} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#f2b36e] text-sm font-black text-[#20211f] transition hover:bg-[#ffca84] disabled:opacity-60">{saving === "new" ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />} Taom qo‘shish</button></div></form><div className="space-y-4">{dishes.length ? dishes.map((dish) => <div key={dish.id} className="rounded-3xl border border-[#eadfd3] bg-white p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#f4e0cb]">{dish.imageUrl ? <img src={dish.imageUrl} alt={dish.nameUz} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">{dish.emoji || "🍱"}</div>}</div><div><p className="font-black">{dish.nameUz}</p><p className="mt-1 text-xs text-[#81776d]">{formatPrice(dish.price)} · {dish.quantity} ta</p></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void toggleMenu(dish)} disabled={saving === dish.id} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition ${dish.inMenu ? "bg-[#e5f0e4] text-[#2f6142]" : "border border-[#eadfd3] bg-white text-[#81776d] hover:border-[#bd2b1f] hover:text-[#bd2b1f]"}`}>{dish.inMenu ? <Check size={14} /> : <Plus size={14} />} {dish.inMenu ? "Menyuda" : "Menyuga qo‘shish"}</button><button type="button" onClick={() => void saveDish(dish)} disabled={saving === dish.id} className="inline-flex items-center gap-2 rounded-full bg-[#20211f] px-3 py-2 text-xs font-black text-white transition hover:bg-[#bd2b1f] disabled:opacity-60"><Save size={14} /> Saqlash</button><button type="button" onClick={() => void deleteDish(dish.id)} disabled={saving === dish.id} className="inline-flex items-center gap-2 rounded-full border border-[#efc4bc] bg-[#fff6f4] px-3 py-2 text-xs font-black text-[#bd2b1f] transition hover:bg-[#fff0ed] disabled:opacity-60"><Trash2 size={14} /> O‘chirish</button></div></div><div className="mt-5 grid gap-3 md:grid-cols-3"><TextField label="O‘zbekcha nom" value={dish.nameUz} onChange={(value) => updateDish(dish.id, "nameUz", value)} /><TextField label="English name" value={dish.nameEn} onChange={(value) => updateDish(dish.id, "nameEn", value)} /><TextField label="Русское название" value={dish.nameRu} onChange={(value) => updateDish(dish.id, "nameRu", value)} /></div><div className="mt-3 grid gap-3 md:grid-cols-3"><TextAreaField label="O‘zbekcha ma’lumot" value={dish.descriptionUz} onChange={(value) => updateDish(dish.id, "descriptionUz", value)} /><TextAreaField label="English description" value={dish.descriptionEn} onChange={(value) => updateDish(dish.id, "descriptionEn", value)} /><TextAreaField label="Описание на русском" value={dish.descriptionRu} onChange={(value) => updateDish(dish.id, "descriptionRu", value)} /></div><div className="mt-3 grid gap-3 sm:grid-cols-[140px_140px_1fr_auto] sm:items-end"><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">Narxi</span><input type="number" min="1" value={dish.price} onChange={(event) => updateDish(dish.id, "price", Number(event.target.value))} className={fieldClass} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">Soni</span><input type="number" min="0" value={dish.quantity} onChange={(event) => updateDish(dish.id, "quantity", Number(event.target.value))} className={fieldClass} /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">Emoji</span><input value={dish.emoji} onChange={(event) => updateDish(dish.id, "emoji", event.target.value)} className={`${fieldClass} text-center text-xl`} /></label><label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#e3d6c8] bg-[#fffaf4] px-3 text-xs font-black text-[#706b64] transition hover:border-[#bd2b1f] hover:text-[#bd2b1f]"><ImagePlus size={16} /> {uploading === String(dish.id) ? "Yuklanmoqda" : "Rasm almashtirish"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, dish.id); }} /></label></div><p className="mt-3 text-xs text-[#a39a90]">O‘zgarishlarni saqlash uchun “Saqlash” tugmasini bosing.</p></div>) : <div className="rounded-3xl border border-dashed border-[#d7c8bb] bg-white px-6 py-16 text-center"><LayoutGrid className="mx-auto text-[#bd2b1f]" /><h2 className="mt-4 text-xl font-black">Katalog bo‘sh</h2><p className="mt-2 text-sm text-[#81776d]">Chapdagi forma orqali birinchi taomni qo‘shing.</p></div>}</div></div></section> : <section className="grid gap-5 lg:grid-cols-2"><form onSubmit={saveSiteSettings} className="rounded-3xl border border-[#eadfd3] bg-white p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f8e7df] text-[#bd2b1f]"><Settings size={20} /></div><div><p className="text-xs font-black uppercase tracking-wider text-[#bd2b1f]">Sayt ko‘rinishi</p><h2 className="text-xl font-black">Umumiy sozlamalar</h2></div></div><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><TextField label="Brend nomi" value={settings.brandName} onChange={(value) => updateSetting("brandName", value)} /><TextField label="Telefon raqami" value={settings.phone} onChange={(value) => updateSetting("phone", value)} /></div><TextField label="Telegram username (ixtiyoriy)" value={settings.telegramUsername} onChange={(value) => updateSetting("telegramUsername", value)} /><div className="rounded-2xl border border-[#eadfd3] bg-[#fffaf4] p-4"><p className="text-sm font-black">Bosh sahifa sarlavhasi</p><div className="mt-3 space-y-3"><TextField label="O‘zbekcha" value={settings.heroTitleUz} onChange={(value) => updateSetting("heroTitleUz", value)} /><TextField label="English" value={settings.heroTitleEn} onChange={(value) => updateSetting("heroTitleEn", value)} /><TextField label="Русский" value={settings.heroTitleRu} onChange={(value) => updateSetting("heroTitleRu", value)} /></div></div><div className="rounded-2xl border border-[#eadfd3] bg-[#fffaf4] p-4"><p className="text-sm font-black">Bosh sahifa ma’lumoti</p><div className="mt-3 space-y-3"><TextAreaField label="O‘zbekcha" value={settings.heroTextUz} onChange={(value) => updateSetting("heroTextUz", value)} /><TextAreaField label="English" value={settings.heroTextEn} onChange={(value) => updateSetting("heroTextEn", value)} /><TextAreaField label="Русский" value={settings.heroTextRu} onChange={(value) => updateSetting("heroTextRu", value)} /></div></div><div className="rounded-2xl border border-[#eadfd3] bg-[#fffaf4] p-4"><p className="text-sm font-black">Yetkazib berish yozuvi</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><TextField label="UZ" value={settings.deliveryTextUz} onChange={(value) => updateSetting("deliveryTextUz", value)} /><TextField label="EN" value={settings.deliveryTextEn} onChange={(value) => updateSetting("deliveryTextEn", value)} /><TextField label="RU" value={settings.deliveryTextRu} onChange={(value) => updateSetting("deliveryTextRu", value)} /></div></div><label className="flex items-center gap-3 rounded-2xl border border-[#eadfd3] bg-[#fffaf4] px-4 py-3"><input type="checkbox" checked={settings.acceptingOrders} onChange={(event) => updateSetting("acceptingOrders", event.target.checked)} className="h-5 w-5 accent-[#bd2b1f]" /><span><span className="block text-sm font-black">Buyurtmalarni qabul qilish ochiq</span><span className="mt-1 block text-xs text-[#81776d]">O‘chirilsa, mijozlar buyurtma bera olmaydi.</span></span></label><button type="submit" disabled={saving === "settings"} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#20211f] px-5 text-sm font-black text-white transition hover:bg-[#bd2b1f] disabled:opacity-60">{saving === "settings" ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} Sozlamalarni saqlash</button></div></form><div className="space-y-5"><form onSubmit={saveTelegram} className="rounded-3xl border border-[#eadfd3] bg-[#20211f] p-5 text-white sm:p-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2b4e42] text-[#b9e4c4]"><MessageCircle size={21} /></div><div><p className="text-xs font-black uppercase tracking-wider text-[#f2b36e]">Buyurtma xabarlari</p><h2 className="text-xl font-black">Telegram bot</h2></div></div><p className="mt-4 text-sm leading-6 text-white/65">Yangi buyurtma tushganda shu bot orqali siz ko‘rsatgan chatga xabar boradi.</p><div className="mt-5 space-y-3"><label className="block"><span className="mb-1.5 block text-xs font-bold text-white/65">Bot tokeni</span><input type="password" value={telegramToken} onChange={(event) => setTelegramToken(event.target.value)} className={darkFieldClass} placeholder={telegramConfigured ? "Ulangan tokenni almashtirish uchun yangi token kiriting" : "123456:ABC..."} /></label><TextField dark label="Chat ID" value={telegramChatId} onChange={setTelegramChatId} /><div className="flex flex-wrap gap-2"><button type="submit" disabled={saving === "telegram"} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#f2b36e] px-4 text-sm font-black text-[#20211f] transition hover:bg-[#ffca84] disabled:opacity-60">{saving === "telegram" ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} {telegramConfigured ? "Saqlash" : "Botni ulash"}</button><button type="button" disabled={!telegramConfigured || saving === "test"} onClick={() => void testTelegram()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/20 px-4 text-sm font-bold text-white transition hover:bg-white/10 disabled:opacity-40">{saving === "test" ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={16} />} Test yuborish</button>{telegramConfigured && <button type="button" onClick={() => void disconnectTelegram()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#f09b8e]/40 px-4 text-sm font-bold text-[#ffb2a7] transition hover:bg-[#bd2b1f]/20"><X size={16} /> Uzish</button>}</div></div><p className="mt-4 text-xs text-white/45">Token bazada himoyalangan ko‘rinishda saqlanadi va panelda qayta ko‘rsatilmaydi.</p></form><form onSubmit={changePassword} className="rounded-3xl border border-[#eadfd3] bg-white p-5 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e5f0e4] text-[#2f6142]"><KeyRound size={21} /></div><div><p className="text-xs font-black uppercase tracking-wider text-[#bd2b1f]">Xavfsizlik</p><h2 className="text-xl font-black">Admin parolini almashtirish</h2></div></div><div className="mt-5 space-y-3"><input required type="password" minLength={8} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Amaldagi parol" className={fieldClass} /><input required type="password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Yangi parol — kamida 8 belgi" className={fieldClass} /><input required type="password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Yangi parolni tasdiqlang" className={fieldClass} /><button type="submit" disabled={saving === "password"} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#20211f] px-5 text-sm font-black text-white transition hover:bg-[#bd2b1f] disabled:opacity-60">{saving === "password" ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />} Parolni almashtirish</button></div></form></div></section>}</div></main>;
}
