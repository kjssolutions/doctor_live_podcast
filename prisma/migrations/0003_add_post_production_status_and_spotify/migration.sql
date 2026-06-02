-- Add post-production workflow fields onto doctor_table
ALTER TABLE `doctor_table`
  ADD COLUMN `post_production_status` ENUM('PROCESSING','DONE','SPOTIFY') NOT NULL DEFAULT 'PROCESSING',
  ADD COLUMN `spotify_url` TEXT NULL;

