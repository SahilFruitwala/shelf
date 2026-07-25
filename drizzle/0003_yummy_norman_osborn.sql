CREATE TABLE `user_feature_flags` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sharing` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
