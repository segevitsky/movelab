CREATE TABLE `section_preset` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`drills` text NOT NULL,
	`from_block_name` text,
	`created_at` integer NOT NULL
);
