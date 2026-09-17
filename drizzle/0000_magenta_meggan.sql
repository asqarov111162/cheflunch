CREATE TABLE `daily_menu_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`menu_id` integer NOT NULL,
	`dish_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_menu_items_menu_dish_unique` ON `daily_menu_items` (`menu_id`,`dish_id`);--> statement-breakpoint
CREATE TABLE `daily_menus` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`menu_date` text NOT NULL,
	`is_published` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_menus_menu_date_unique` ON `daily_menus` (`menu_date`);--> statement-breakpoint
CREATE TABLE `dishes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name_uz` text NOT NULL,
	`name_en` text DEFAULT '' NOT NULL,
	`name_ru` text DEFAULT '' NOT NULL,
	`description_uz` text DEFAULT '' NOT NULL,
	`description_en` text DEFAULT '' NOT NULL,
	`description_ru` text DEFAULT '' NOT NULL,
	`price` integer NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`emoji` text DEFAULT '🍱' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`dish_id` integer,
	`dish_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`subtotal` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`address` text NOT NULL,
	`location_url` text DEFAULT '' NOT NULL,
	`latitude` real,
	`longitude` real,
	`note` text DEFAULT '' NOT NULL,
	`total` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_order_number_unique` ON `orders` (`order_number`);