-- CreateTable
CREATE TABLE `edited_video_table` (
    `id` VARCHAR(191) NOT NULL,
    `doctor_id` INT NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `created_by_employee_id` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `edited_video_table_doctor_id_key`(`doctor_id`),
    INDEX `edited_video_table_doctor_id_idx`(`doctor_id`),
    INDEX `edited_video_table_asset_id_idx`(`asset_id`),
    INDEX `edited_video_table_created_by_employee_id_idx`(`created_by_employee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `edited_video_table` ADD CONSTRAINT `ev_doctor_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctor_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edited_video_table` ADD CONSTRAINT `ev_asset_fkey` FOREIGN KEY (`asset_id`) REFERENCES `asset_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `edited_video_table` ADD CONSTRAINT `ev_employee_fkey` FOREIGN KEY (`created_by_employee_id`) REFERENCES `tbl_employee`(`emp_employee_id`) ON DELETE SET NULL ON UPDATE CASCADE;
