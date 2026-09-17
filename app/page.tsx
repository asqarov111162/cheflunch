"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  LocateFixed,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingBag,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatMenuDate, formatPrice, localized, todayInTashkent, type Language, type MenuItem } from "./lib/catalog";
import { copy } from "./lib/i18n";
import { defaultSiteSettings, localizedSiteSetting, type SiteSettings } from "./lib/site-settings";

type OrderForm = {
  name: string;
  phone: string;
  address: string;
  locationUrl: string;
  note: string;
  latitude?: number;
  longitude?: number;
};

type ModelContextLike = {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const emptyForm: OrderForm = {
  name: "",
  phone: "",
  address: "",
  locationUrl: "",
  note: "",
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
      <div className="h-11 w-11 overflow-hidden rounded-2xl border border-[#eadfd3] bg-white shadow-sm">
        <img src="/logo.png" alt="CHEF LUNCH logo" className="h-full w-full object-cover" />
      </div>
      {!compact && (
        <div className="leading-none">
          <p className="text-[15px] font-black tracking-[0.08em] text-[#20211f]">CHEF LUNCH</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[#bd2b1f]">by Kadirov</p>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [language, setLanguage] = useState<Language>("uz");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuDate, setMenuDate] = useState(todayInTashkent());
  const [menuLoading, setMenuLoading] = useState(true);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(emptyForm);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState("");

  const t = copy[language];
  const heroTitle = localizedSiteSetting(siteSettings, "heroTitle", language) || t.heroTitle;
  const heroText = localizedSiteSetting(siteSettings, "heroText", language) || t.heroText;
  const deliveryText = localizedSiteSetting(siteSettings, "deliveryText", language) || t.freeDelivery;
  const ordersClosedText = language === "uz" ? "Buyurtmalar vaqtincha yopiq" : language === "en" ? "Orders are temporarily closed" : "Заказы временно закрыты";
  const cartItems = useMemo(
    () => menu.filter((item) => cart[String(item.id)]).map((item) => ({ ...item, count: cart[String(item.id)] })),
    [cart, menu],
  );
  const cartCount = cartItems.reduce((sum, item) => sum + item.count, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.count, 0);

  useEffect(() => {
    fetch("/api/menu")
      .then((response) => (response.ok ? response.json() as Promise<{ items?: MenuItem[]; date?: string }> : Promise.reject(new Error("menu"))))
      .then((payload) => {
        setMenu(payload.items ?? []);
        if (payload.date) setMenuDate(payload.date);
      })
      .catch(() => undefined)
      .finally(() => setMenuLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() as Promise<SiteSettings> : Promise.reject(new Error("settings"))))
      .then((payload) => setSiteSettings(payload))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool({
        name: "read_today_menu",
        title: "Read today’s menu",
        description: "Read the dishes currently shown in the CHEF LUNCH menu.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({ items: menu.map((item) => ({ id: String(item.id), name: item.nameUz, price: item.price, available: item.quantity })) }),
      }, { signal: lifecycle.signal });
      await modelContext.registerTool({
        name: "add_menu_item_to_cart",
        title: "Add a menu item to the cart",
        description: "Add one selected CHEF LUNCH dish to the visible cart.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 20 } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: (input) => {
          const value = typeof input === "object" && input !== null ? input as { id?: string; quantity?: number } : {};
          const item = menu.find((candidate) => String(candidate.id) === value.id);
          if (!item) return { ok: false, error: "Dish not found" };
          const quantity = Math.max(1, Math.min(item.quantity, Math.floor(value.quantity || 1)));
          setCart((current) => ({ ...current, [String(item.id)]: Math.min(item.quantity, (current[String(item.id)] ?? 0) + quantity) }));
          return { ok: true, id: String(item.id), quantity };
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [menu]);

  function addToCart(item: MenuItem) {
    setCart((current) => {
      const key = String(item.id);
      const nextCount = Math.min((current[key] ?? 0) + 1, item.quantity);
      return { ...current, [key]: nextCount };
    });
  }

  function updateCount(item: MenuItem, direction: "up" | "down") {
    const key = String(item.id);
    setCart((current) => {
      const next = Math.max(0, Math.min(item.quantity, (current[key] ?? 0) + (direction === "up" ? 1 : -1)));
      const updated = { ...current };
      if (next === 0) delete updated[key];
      else updated[key] = next;
      return updated;
    });
  }

  function useLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Brauzeringiz lokatsiyani aniqlashni qo‘llab-quvvatlamaydi.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setForm((current) => ({
          ...current,
          latitude,
          longitude,
          locationUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
        }));
      },
      () => setError("Lokatsiyaga ruxsat berilmadi. Manzilni qo‘lda kiriting."),
    );
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cartItems.length) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({ id: item.id, quantity: item.count })),
          ...form,
        }),
      });
      const payload = (await response.json()) as { error?: string; order?: { orderNumber?: string } };
      if (!response.ok) throw new Error(payload.error || "Buyurtma yuborilmadi");
      const orderedCounts = new Map(cartItems.map((item) => [String(item.id), item.count]));
      setMenu((current) => current.map((item) => ({
        ...item,
        quantity: Math.max(0, item.quantity - (orderedCounts.get(String(item.id)) ?? 0)),
      })));
      setSuccess(payload.order?.orderNumber ?? "CHEF LUNCH");
      setCart({});
      setForm(emptyForm);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Buyurtma yuborilmadi");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fffaf4] text-[#20211f]">
      <header className="sticky top-0 z-30 border-b border-[#eadfd3]/80 bg-[#fffaf4]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <a href="#top" aria-label="CHEF LUNCH bosh sahifa"><Logo /></a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#706b64] md:flex">
            <a href="#menu" className="transition hover:text-[#bd2b1f]">{t.menu}</a>
            <a href="#how" className="transition hover:text-[#bd2b1f]">{deliveryText}</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex rounded-full border border-[#eadfd3] bg-white p-1 text-[11px] font-bold">
              {(["uz", "en", "ru"] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`rounded-full px-2.5 py-1.5 uppercase transition ${language === code ? "bg-[#20211f] text-white" : "text-[#837b72] hover:text-[#20211f]"}`}
                >
                  {code}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex h-11 items-center gap-2 rounded-full bg-[#bd2b1f] px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgb(189_43_31/22%)] transition hover:-translate-y-0.5 hover:bg-[#a92118]"
            >
              <ShoppingBag size={17} strokeWidth={2.4} />
              <span className="hidden sm:inline">{t.cart}</span>
              {cartCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-black text-[#bd2b1f]">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <section id="top" className="mx-auto max-w-7xl px-5 pb-16 pt-6 sm:px-8 lg:px-10 lg:pb-24 lg:pt-10">
        <div className="chef-noise relative overflow-hidden rounded-[34px] border border-[#eadfd3] bg-[#f4e8da] px-6 py-8 chef-shadow sm:px-10 sm:py-12 lg:min-h-[480px] lg:px-16 lg:py-14">
          <div className="pointer-events-none absolute -right-28 -top-32 h-[360px] w-[360px] rounded-full bg-[#f8d8c8]/75 blur-2xl" />
          <div className="pointer-events-none absolute bottom-[-120px] left-[28%] h-[300px] w-[300px] rounded-full bg-[#dcead8]/70 blur-3xl" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_0.86fr]">
            <div className="max-w-xl">
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#bd2b1f] shadow-sm">
                  <Sparkles size={14} /> {t.heroEyebrow}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#dfeada] px-3.5 py-2 text-[11px] font-bold text-[#2f6142]">
                  <MapPin size={13} /> {deliveryText}
                </span>
              </div>
              <h1 className="max-w-[650px] whitespace-pre-line text-4xl font-black leading-[1.02] tracking-[-0.055em] text-[#20211f] sm:text-6xl lg:text-[68px]">{heroTitle}</h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-[#6f665e] sm:text-lg">{heroText}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })} className="group inline-flex items-center gap-3 rounded-full bg-[#bd2b1f] px-5 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_rgb(189_43_31/22%)] transition hover:-translate-y-0.5 hover:bg-[#a92118]">
                  {t.viewMenu} <ArrowRight size={17} className="transition group-hover:translate-x-1" />
                </button>
                <div className="flex items-center gap-2 text-sm font-semibold text-[#6f665e]"><Clock3 size={17} className="text-[#bd2b1f]" /> {t.dateLabel}, {formatMenuDate(menuDate, language)}</div>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[410px]">
              <div className="relative aspect-square overflow-hidden rounded-[42%_58%_45%_55%/51%_44%_56%_49%] border-[12px] border-white/85 bg-gradient-to-br from-[#c83e2e] via-[#e77a51] to-[#f5c07d] shadow-[0_28px_60px_rgb(137_56_32/25%)]">
                <div className="absolute inset-7 flex items-center justify-center rounded-full border border-white/30 bg-[#fffaf4]/90 shadow-inner">
                  <div className="text-center">
                    <div className="text-[104px] leading-none drop-shadow-[0_12px_8px_rgb(80_45_23/15%)] sm:text-[128px]">🍛</div>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.2em] text-[#bd2b1f]">CHEF LUNCH</p>
                  </div>
                </div>
                <div className="absolute right-10 top-10 rounded-2xl bg-white px-3 py-2 text-center shadow-lg">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#bd2b1f]">{t.dateLabel}</p>
                  <p className="mt-0.5 text-sm font-black text-[#20211f]">{formatMenuDate(menuDate, language)}</p>
                </div>
              </div>
              <div className="absolute -bottom-4 -left-4 flex items-center gap-2 rounded-2xl border border-[#eadfd3] bg-white px-4 py-3 shadow-[0_16px_30px_rgb(80_45_23/13%)] sm:-left-8">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5f0e4] text-[#2f6142]"><Utensils size={18} /></div>
                <div><p className="text-xs font-black text-[#20211f]">{menu.length} {t.dishes}</p><p className="text-[11px] text-[#81776d]">{t.menu}</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="menu" className="mx-auto max-w-7xl scroll-mt-24 px-5 pb-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[#bd2b1f]">{t.dateLabel} • {formatMenuDate(menuDate, language)}</p>
            <h2 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">{t.menu}</h2>
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#6f665e]"><CalendarDays size={17} className="text-[#bd2b1f]" /> {deliveryText}</div>
        </div>
        {!siteSettings.acceptingOrders && <div className="mb-5 rounded-2xl border border-[#efc4bc] bg-[#fff0ed] px-4 py-3 text-sm font-bold text-[#a92118]">{ordersClosedText}</div>}
        {menuLoading ? <div className="rounded-3xl border border-dashed border-[#d7c8bb] bg-white px-6 py-16 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#eadfd3] border-t-[#bd2b1f]" /><p className="mt-4 text-sm font-bold text-[#81776d]">{language === "uz" ? "Menyu yuklanmoqda..." : language === "en" ? "Loading menu..." : "Меню загружается..."}</p></div> : menu.length === 0 ? <div className="rounded-3xl border border-dashed border-[#d7c8bb] bg-white px-6 py-16 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f5ede4] text-2xl">🍽️</div><h3 className="mt-4 text-xl font-black">{language === "uz" ? "Bugungi menyu hali kiritilmagan" : language === "en" ? "Today’s menu is not ready yet" : "Сегодняшнее меню ещё не добавлено"}</h3><p className="mt-2 text-sm leading-6 text-[#81776d]">{language === "uz" ? "Iltimos, birozdan keyin qayta tekshiring." : language === "en" ? "Please check again a little later." : "Пожалуйста, проверьте немного позже."}</p></div> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {menu.map((item) => {
            const count = cart[String(item.id)] ?? 0;
            const soldOut = item.quantity <= 0;
            return (
              <article key={String(item.id)} className="group overflow-hidden rounded-[26px] border border-[#eadfd3] bg-white shadow-[0_10px_30px_rgb(80_45_23/5%)] transition hover:-translate-y-1 hover:shadow-[0_18px_38px_rgb(80_45_23/10%)]">
                <div className="relative h-52 overflow-hidden bg-[#f1e3d4]">
                  {item.imageUrl ? <img src={item.imageUrl} alt={String(localized(item, language, "name"))} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#fff7eb_0%,#f4d8bf_68%,#eac2a4_100%)]"><span className="text-[92px] drop-shadow-[0_16px_10px_rgb(80_45_23/15%)] transition duration-500 group-hover:scale-110">{item.emoji ?? "🍱"}</span></div>}
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-black text-[#bd2b1f] shadow-sm">{formatPrice(item.price)}</div>
                  {soldOut && <div className="absolute inset-0 flex items-center justify-center bg-[#20211f]/45"><span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#20211f]">{t.soldOut}</span></div>}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-xl font-black tracking-[-0.03em]">{String(localized(item, language, "name"))}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-[#81776d]">{String(localized(item, language, "description"))}</p></div>
                    <div className="mt-1 flex shrink-0 items-center gap-1 text-xs font-bold text-[#547b56]"><span className="h-2 w-2 rounded-full bg-[#547b56]" /> {item.quantity} {t.available}</div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-[#f0e6dc] pt-4">
                    {count > 0 ? <div className="flex items-center gap-2 rounded-full bg-[#f8f0e7] p-1"><button type="button" aria-label="Kamaytirish" onClick={() => updateCount(item, "down")} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#20211f] shadow-sm transition hover:text-[#bd2b1f]"><Minus size={15} /></button><span className="w-5 text-center text-sm font-black">{count}</span><button type="button" aria-label="Ko‘paytirish" onClick={() => updateCount(item, "up")} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#20211f] text-white shadow-sm transition hover:bg-[#bd2b1f]"><Plus size={15} /></button></div> : <span className="text-sm font-bold text-[#a39a90]">{item.quantity} {t.available}</span>}
                    <button type="button" disabled={soldOut || !siteSettings.acceptingOrders} onClick={() => addToCart(item)} className="inline-flex items-center gap-2 rounded-full bg-[#20211f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#bd2b1f] disabled:cursor-not-allowed disabled:opacity-40"><Plus size={16} /> {!siteSettings.acceptingOrders ? ordersClosedText : count > 0 ? t.added : t.add}</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>}
      </section>

      <section id="how" className="border-y border-[#eadfd3] bg-[#f5ede4] px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div><span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#bd2b1f] text-white"><Utensils size={20} /></span><h2 className="max-w-sm text-3xl font-black tracking-[-0.04em] sm:text-4xl">{t.footerText}</h2></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[{ icon: <CalendarDays size={19} />, title: t.everyDay, text: t.freshMenu }, { icon: <MapPin size={19} />, title: deliveryText, text: t.deliveryAtHome }, { icon: <Check size={19} />, title: t.easyOrder, text: t.inFewSteps }].map((step) => <div key={step.title} className="rounded-3xl border border-[#eadfd3] bg-white p-5"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e5f0e4] text-[#2f6142]">{step.icon}</div><p className="font-black">{step.title}</p><p className="mt-1 text-sm leading-6 text-[#81776d]">{step.text}</p></div>)}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8 text-sm text-[#81776d] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><Logo compact /><div className="flex flex-wrap items-center gap-4"><p>© {siteSettings.brandName}. {deliveryText}.</p>{siteSettings.phone && <a href={`tel:${siteSettings.phone}`} className="font-semibold text-[#bd2b1f]">{siteSettings.phone}</a>}<a href="/admin" className="font-semibold text-[#bd2b1f] hover:underline">{t.admin} <ChevronRight size={14} className="inline" /></a></div></footer>

      {cartOpen && <div className="fixed inset-0 z-50 bg-[#20211f]/30 backdrop-blur-sm" onClick={() => setCartOpen(false)}><aside role="dialog" aria-modal="true" aria-label={t.cart} onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col border-l border-[#eadfd3] bg-[#fffaf4] shadow-[-20px_0_60px_rgb(80_45_23/16%)]">
        <div className="flex items-center justify-between border-b border-[#eadfd3] px-5 py-5 sm:px-7"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#bd2b1f]">CHEF LUNCH</p><h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">{success ? t.orderSuccess : t.cart}</h2></div><button type="button" aria-label={t.close} onClick={() => setCartOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full border border-[#eadfd3] bg-white text-[#706b64] transition hover:text-[#bd2b1f]"><X size={18} /></button></div>
        {success ? <div className="flex flex-1 flex-col items-center justify-center px-8 text-center"><div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#e5f0e4] text-[#2f6142]"><Check size={36} strokeWidth={2.5} /></div><h3 className="mt-6 text-2xl font-black">{t.orderSuccess}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-[#81776d]">{t.orderSuccessText}</p><div className="mt-6 rounded-2xl bg-white px-6 py-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-[#a39a90]">{t.orderNumber}</p><p className="mt-1 text-xl font-black text-[#bd2b1f]">{success}</p></div><button type="button" onClick={() => { setSuccess(null); setCartOpen(false); }} className="mt-8 rounded-full bg-[#20211f] px-5 py-3 text-sm font-bold text-white">{t.close}</button></div> : <form onSubmit={submitOrder} className="flex min-h-0 flex-1 flex-col"><div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">{cartItems.length ? <div className="space-y-3">{cartItems.map((item) => <div key={String(item.id)} className="flex items-center gap-3 rounded-2xl border border-[#eadfd3] bg-white p-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#f4e0cb] text-3xl">{item.emoji ?? "🍱"}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{String(localized(item, language, "name"))}</p><p className="mt-1 text-xs font-semibold text-[#bd2b1f]">{formatPrice(item.price * item.count)}</p></div><div className="flex items-center gap-1 rounded-full bg-[#f8f0e7] p-1"><button type="button" onClick={() => updateCount(item, "down")} className="flex h-7 w-7 items-center justify-center rounded-full bg-white"><Minus size={13} /></button><span className="w-5 text-center text-xs font-black">{item.count}</span><button type="button" onClick={() => updateCount(item, "up")} className="flex h-7 w-7 items-center justify-center rounded-full bg-[#20211f] text-white"><Plus size={13} /></button></div></div>)}</div> : <div className="rounded-3xl bg-[#f5ede4] px-6 py-12 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#bd2b1f]"><ShoppingBag size={23} /></div><h3 className="mt-4 font-black">{t.emptyCart}</h3><p className="mt-2 text-sm leading-6 text-[#81776d]">{t.emptyCartText}</p></div>}
          {cartItems.length > 0 && <div className="mt-7 border-t border-[#eadfd3] pt-6"><div className="mb-4 flex items-center justify-between"><h3 className="font-black">{t.checkout}</h3><span className="rounded-full bg-[#e5f0e4] px-3 py-1 text-xs font-bold text-[#2f6142]">{t.freeDelivery}</span></div><div className="space-y-3"><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{t.name}</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="h-12 w-full rounded-2xl border border-[#e3d6c8] bg-white px-4 text-sm outline-none transition placeholder:text-[#b1a79d] focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10" placeholder="Ism Familiya" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{t.phone}</span><div className="relative"><Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a39a90]" /><input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="h-12 w-full rounded-2xl border border-[#e3d6c8] bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-[#b1a79d] focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10" placeholder="+998 90 123 45 67" /></div></label><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{t.address}</span><input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="h-12 w-full rounded-2xl border border-[#e3d6c8] bg-white px-4 text-sm outline-none transition placeholder:text-[#b1a79d] focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10" placeholder="Ko‘cha, uy va ofis raqami" /></label><div><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{t.location}</span><button type="button" onClick={useLocation} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition ${form.locationUrl ? "border-[#b7d3b9] bg-[#e5f0e4] text-[#2f6142]" : "border-[#e3d6c8] bg-white text-[#706b64] hover:border-[#bd2b1f] hover:text-[#bd2b1f]"}`}><LocateFixed size={17} /> {form.locationUrl ? t.located : t.locate}</button></div><label className="block"><span className="mb-1.5 block text-xs font-bold text-[#706b64]">{t.note}</span><textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className="min-h-20 w-full resize-none rounded-2xl border border-[#e3d6c8] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-[#b1a79d] focus:border-[#bd2b1f] focus:ring-4 focus:ring-[#bd2b1f]/10" placeholder={t.notePlaceholder} /></label></div></div>}
        </div>{cartItems.length > 0 && <div className="border-t border-[#eadfd3] bg-white/80 px-5 py-5 sm:px-7"><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold text-[#81776d]">{t.total}</span><span className="text-xl font-black text-[#20211f]">{formatPrice(cartTotal)}</span></div>{error && <p className="mb-3 rounded-xl bg-[#fff0ed] px-3 py-2 text-xs font-semibold text-[#a92118]">{error}</p>}<button type="submit" disabled={sending} className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#bd2b1f] px-5 text-sm font-black text-white shadow-[0_12px_30px_rgb(189_43_31/22%)] transition hover:bg-[#a92118] disabled:cursor-wait disabled:opacity-60">{sending ? t.orderSending : t.submitOrder}<ArrowRight size={17} /></button></div>}</form>}
      </aside></div>}
    </main>
  );
}
