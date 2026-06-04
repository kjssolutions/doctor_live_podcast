-- Row numbers and denormalized doctor fields for easier DB reading

ALTER TABLE `question_table`
  ADD COLUMN `row_number` INT UNSIGNED NULL;

SET @q := 0;
UPDATE `question_table` SET `row_number` = (@q := @q + 1) ORDER BY `order`, `created_at`;

ALTER TABLE `question_table`
  MODIFY `row_number` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE;

ALTER TABLE `asset_table`
  ADD COLUMN `row_number` INT UNSIGNED NULL,
  ADD COLUMN `doctor_id` INT NULL,
  ADD COLUMN `doctor_code` VARCHAR(50) NULL,
  ADD COLUMN `doctor_name` VARCHAR(255) NULL,
  ADD COLUMN `employee_id` VARCHAR(30) NULL;

UPDATE `asset_table` a
INNER JOIN `answer_recording_table` r ON r.asset_id = a.id
INNER JOIN `doctor_table` d ON d.id = r.doctor_id
SET
  a.doctor_id = d.id,
  a.doctor_code = d.doctor_id,
  a.doctor_name = d.doctor_name,
  a.employee_id = d.created_by_employee_id;

UPDATE `asset_table` a
INNER JOIN `edited_video_table` e ON e.asset_id = a.id
INNER JOIN `doctor_table` d ON d.id = e.doctor_id
SET
  a.doctor_id = d.id,
  a.doctor_code = d.doctor_id,
  a.doctor_name = d.doctor_name,
  a.employee_id = d.created_by_employee_id
WHERE a.doctor_id IS NULL;

SET @a := 0;
UPDATE `asset_table` SET `row_number` = (@a := @a + 1) ORDER BY `created_at`;

ALTER TABLE `asset_table`
  MODIFY `row_number` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  MODIFY `doctor_id` INT NOT NULL,
  MODIFY `doctor_code` VARCHAR(50) NOT NULL,
  MODIFY `doctor_name` VARCHAR(255) NULL,
  MODIFY `employee_id` VARCHAR(30) NULL;

CREATE INDEX `asset_table_doctor_id_idx` ON `asset_table`(`doctor_id`);
CREATE INDEX `asset_table_doctor_code_idx` ON `asset_table`(`doctor_code`);
CREATE INDEX `asset_table_employee_id_idx` ON `asset_table`(`employee_id`);

ALTER TABLE `answer_recording_table`
  ADD COLUMN `row_number` INT UNSIGNED NULL,
  ADD COLUMN `doctor_code` VARCHAR(50) NULL,
  ADD COLUMN `doctor_name` VARCHAR(255) NULL,
  ADD COLUMN `employee_id` VARCHAR(30) NULL;

UPDATE `answer_recording_table` r
INNER JOIN `doctor_table` d ON d.id = r.doctor_id
SET
  r.doctor_code = d.doctor_id,
  r.doctor_name = d.doctor_name,
  r.employee_id = d.created_by_employee_id;

SET @r := 0;
UPDATE `answer_recording_table` SET `row_number` = (@r := @r + 1) ORDER BY `created_at`;

ALTER TABLE `answer_recording_table`
  MODIFY `row_number` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  MODIFY `doctor_code` VARCHAR(50) NOT NULL,
  MODIFY `doctor_name` VARCHAR(255) NULL,
  MODIFY `employee_id` VARCHAR(30) NULL;

ALTER TABLE `edited_video_table`
  ADD COLUMN `row_number` INT UNSIGNED NULL,
  ADD COLUMN `doctor_code` VARCHAR(50) NULL,
  ADD COLUMN `doctor_name` VARCHAR(255) NULL;

UPDATE `edited_video_table` e
INNER JOIN `doctor_table` d ON d.id = e.doctor_id
SET
  e.doctor_code = d.doctor_id,
  e.doctor_name = d.doctor_name;

SET @e := 0;
UPDATE `edited_video_table` SET `row_number` = (@e := @e + 1) ORDER BY `created_at`;

ALTER TABLE `edited_video_table`
  MODIFY `row_number` INT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  MODIFY `doctor_code` VARCHAR(50) NOT NULL,
  MODIFY `doctor_name` VARCHAR(255) NULL;
