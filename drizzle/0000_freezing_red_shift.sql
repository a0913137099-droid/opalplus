CREATE TABLE `trial_quotas` (
	`bucket` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shared_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`updated_at` text NOT NULL
);
