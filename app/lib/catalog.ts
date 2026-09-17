export type Language = "uz" | "en" | "ru";

export type MenuItem = {
  id: string | number;
  nameUz: string;
  nameEn: string;
  nameRu: string;
  descriptionUz: string;
  descriptionEn: string;
  descriptionRu: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  emoji?: string;
  isActive?: boolean;
};

export function localized(
  item: Pick<
    MenuItem,
    | "nameUz"
    | "nameEn"
    | "nameRu"
    | "descriptionUz"
    | "descriptionEn"
    | "descriptionRu"
  >,
  language: Language,
  field: "name" | "description",
) {
  const suffix = language === "uz" ? "Uz" : language === "en" ? "En" : "Ru";
  return item[`${field}${suffix}` as keyof typeof item] || item[`${field}Uz` as keyof typeof item];
}

export function formatPrice(value: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(value)} so‘m`;
}

export function todayInTashkent() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatMenuDate(date: string, language: Language) {
  const [, monthValue, dayValue] = date.split("-");
  const month = Number(monthValue) - 1;
  const day = Number(dayValue);
  const months = {
    uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"],
    en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  }[language];
  return language === "en" ? `${months[month]} ${day}` : `${day} ${months[month]}`;
}
