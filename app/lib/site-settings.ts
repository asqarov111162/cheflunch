export type SiteSettings = {
  brandName: string;
  phone: string;
  telegramUsername: string;
  acceptingOrders: boolean;
  heroTitleUz: string;
  heroTitleEn: string;
  heroTitleRu: string;
  heroTextUz: string;
  heroTextEn: string;
  heroTextRu: string;
  deliveryTextUz: string;
  deliveryTextEn: string;
  deliveryTextRu: string;
};

export const defaultSiteSettings: SiteSettings = {
  brandName: "CHEF LUNCH",
  phone: "",
  telegramUsername: "",
  acceptingOrders: true,
  heroTitleUz: "Issiq tushlik,\nkuningizga mazali tanaffus",
  heroTitleEn: "A warm lunch for\na delicious break",
  heroTitleRu: "Тёплый обед для\nвкусной паузы",
  heroTextUz: "CHEF LUNCH bilan uy taomlari ofisingiz yoki uyingizgacha yetib boradi.",
  heroTextEn: "CHEF LUNCH brings homestyle meals to your office or home.",
  heroTextRu: "CHEF LUNCH доставит домашние блюда в офис или домой.",
  deliveryTextUz: "Yetkazib berish bepul",
  deliveryTextEn: "Free delivery",
  deliveryTextRu: "Бесплатная доставка",
};

function stringValue(value: unknown, fallback: string, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) || fallback : fallback;
}

export function normalizeSiteSettings(input: unknown): SiteSettings {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    brandName: stringValue(source.brandName, defaultSiteSettings.brandName, 80),
    phone: stringValue(source.phone, defaultSiteSettings.phone, 40),
    telegramUsername: stringValue(source.telegramUsername, defaultSiteSettings.telegramUsername, 80),
    acceptingOrders: source.acceptingOrders !== false,
    heroTitleUz: stringValue(source.heroTitleUz, defaultSiteSettings.heroTitleUz, 180),
    heroTitleEn: stringValue(source.heroTitleEn, defaultSiteSettings.heroTitleEn, 180),
    heroTitleRu: stringValue(source.heroTitleRu, defaultSiteSettings.heroTitleRu, 180),
    heroTextUz: stringValue(source.heroTextUz, defaultSiteSettings.heroTextUz, 300),
    heroTextEn: stringValue(source.heroTextEn, defaultSiteSettings.heroTextEn, 300),
    heroTextRu: stringValue(source.heroTextRu, defaultSiteSettings.heroTextRu, 300),
    deliveryTextUz: stringValue(source.deliveryTextUz, defaultSiteSettings.deliveryTextUz, 80),
    deliveryTextEn: stringValue(source.deliveryTextEn, defaultSiteSettings.deliveryTextEn, 80),
    deliveryTextRu: stringValue(source.deliveryTextRu, defaultSiteSettings.deliveryTextRu, 80),
  };
}

export function localizedSiteSetting(
  settings: SiteSettings,
  field: "heroTitle" | "heroText" | "deliveryText",
  language: "uz" | "en" | "ru",
) {
  const suffix = language === "uz" ? "Uz" : language === "en" ? "En" : "Ru";
  return settings[`${field}${suffix}` as keyof SiteSettings] as string;
}
