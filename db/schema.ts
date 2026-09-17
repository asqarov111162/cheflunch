import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const dishes = sqliteTable("dishes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nameUz: text("name_uz").notNull(),
  nameEn: text("name_en").notNull().default(""),
  nameRu: text("name_ru").notNull().default(""),
  descriptionUz: text("description_uz").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  descriptionRu: text("description_ru").notNull().default(""),
  price: integer("price").notNull(),
  quantity: integer("quantity").notNull().default(0),
  imageUrl: text("image_url").notNull().default(""),
  emoji: text("emoji").notNull().default("🍱"),
  isActive: integer("is_active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dailyMenus = sqliteTable("daily_menus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  menuDate: text("menu_date").notNull().unique(),
  isPublished: integer("is_published").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dailyMenuItems = sqliteTable(
  "daily_menu_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    menuId: integer("menu_id").notNull(),
    dishId: integer("dish_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    menuDishUnique: unique("daily_menu_items_menu_dish_unique").on(
      table.menuId,
      table.dishId,
    ),
  }),
);

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  phone: text("phone").notNull(),
  address: text("address").notNull(),
  locationUrl: text("location_url").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  note: text("note").notNull().default(""),
  total: integer("total").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull(),
  dishId: integer("dish_id"),
  dishName: text("dish_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  subtotal: integer("subtotal").notNull(),
});

export const adminSettings = sqliteTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
