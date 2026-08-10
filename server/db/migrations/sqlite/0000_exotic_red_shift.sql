CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`status` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`winner` text,
	`finish_reason` text,
	`finish_details` text,
	`players` text NOT NULL,
	`move_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `moves` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`move_number` integer NOT NULL,
	`nickname` text,
	`side` text,
	`type` text NOT NULL,
	`x` integer,
	`y` integer,
	`move` text,
	`reason` text,
	`at` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `moves_game_id_idx` ON `moves` (`game_id`);