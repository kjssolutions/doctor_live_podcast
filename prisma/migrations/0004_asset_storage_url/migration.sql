-- Consolidate key, bucket, endpoint into one full storage URL column
ALTER TABLE `asset_table` ADD COLUMN `storage_url` VARCHAR(1024) NULL;

UPDATE `asset_table`
SET `storage_url` = CONCAT(
  'https://',
  `bucket`,
  '.',
  TRIM(TRAILING '/' FROM REPLACE(REPLACE(COALESCE(`endpoint`, ''), 'https://', ''), 'http://', '')),
  '/',
  `key`
)
WHERE `storage_url` IS NULL AND `endpoint` IS NOT NULL AND `endpoint` != '';

UPDATE `asset_table`
SET `storage_url` = `key`
WHERE `storage_url` IS NULL;

ALTER TABLE `asset_table` MODIFY `storage_url` VARCHAR(1024) NOT NULL;

DROP INDEX `asset_table_key_key` ON `asset_table`;

ALTER TABLE `asset_table`
  DROP COLUMN `key`,
  DROP COLUMN `bucket`,
  DROP COLUMN `endpoint`;

CREATE UNIQUE INDEX `asset_table_storage_url_key` ON `asset_table`(`storage_url`);
