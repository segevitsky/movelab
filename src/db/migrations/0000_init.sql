CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`pattern` text,
	`slots` text DEFAULT '[]' NOT NULL,
	`equipment` text DEFAULT '[]' NOT NULL,
	`props` text DEFAULT '[]' NOT NULL,
	`intensity` text,
	`primary_muscles` text DEFAULT '[]' NOT NULL,
	`dosage_default` text,
	`rep_seconds` real,
	`notes` text,
	`start_pose` text,
	`end_pose` text,
	`figure` text,
	`figure_fps` real,
	`figure_frames` integer,
	`loop_start` integer,
	`loop_end` integer,
	`figure_3d` text,
	`scene` text,
	`source_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercise_pattern_idx` ON `exercise` (`pattern`);--> statement-breakpoint
CREATE INDEX `exercise_archived_idx` ON `exercise` (`archived`);--> statement-breakpoint
CREATE TABLE `framework` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`blocks` text NOT NULL,
	`is_preset` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goal` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slot` text,
	`stages` text NOT NULL,
	`current_stage` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `pairing` (
	`a_id` text NOT NULL,
	`b_id` text NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`directed_weight` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`a_id`, `b_id`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`feedback` text,
	`per_exercise` text
);
--> statement-breakpoint
CREATE TABLE `source` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text DEFAULT 'instagram' NOT NULL,
	`url` text NOT NULL,
	`coach` text,
	`caption` text,
	`ocr_text` text,
	`transcript` text,
	`captured_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_exercise` (
	`source_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order` integer NOT NULL,
	`start_sec` real,
	`end_sec` real,
	PRIMARY KEY(`source_id`, `exercise_id`)
);
--> statement-breakpoint
CREATE TABLE `workout` (
	`id` text PRIMARY KEY NOT NULL,
	`framework_id` text NOT NULL,
	`seed` integer NOT NULL,
	`inputs` text NOT NULL,
	`items` text NOT NULL,
	`why` text,
	`favourite` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
