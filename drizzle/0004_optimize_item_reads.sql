ALTER TABLE `items` ADD `normalized_title` text;
--> statement-breakpoint
UPDATE `items`
SET `normalized_title` = trim(
  replace(replace(replace(replace(
    lower(
      replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
        `title`, ':', ''), ',', ''), '.', ''), '-', ''), '''', ''),
        '"', ''), '!', ''), '?', ''), '(', ''), ')', '')
    ),
    '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' ')
);
--> statement-breakpoint
CREATE INDEX `items_list_normalized_title_idx`
ON `items` (`list_id`, `normalized_title`);