ALTER TABLE `user` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `purge_after` integer;