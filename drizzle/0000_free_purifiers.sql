CREATE TABLE "admin_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_menu_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_id" integer NOT NULL,
	"dish_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_menu_items_menu_dish_unique" UNIQUE("menu_id","dish_id")
);
--> statement-breakpoint
CREATE TABLE "daily_menus" (
	"id" serial PRIMARY KEY NOT NULL,
	"menu_date" text NOT NULL,
	"is_published" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "daily_menus_menu_date_unique" UNIQUE("menu_date")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name_uz" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_ru" text DEFAULT '' NOT NULL,
	"description_uz" text DEFAULT '' NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_ru" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '🍱' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	"updated_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"dish_id" integer,
	"dish_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"subtotal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"location_url" text DEFAULT '' NOT NULL,
	"latitude" real,
	"longitude" real,
	"note" text DEFAULT '' NOT NULL,
	"total" integer NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP::text NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
