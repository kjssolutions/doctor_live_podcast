-- CreateTable
CREATE TABLE `employee_table` (
    `emp_employee_id` VARCHAR(32) NOT NULL,
    `emp_name` VARCHAR(191) NOT NULL,
    `emp_designation` VARCHAR(64) NOT NULL,
    `emp_username` VARCHAR(64) NOT NULL,
    `emp_password` VARCHAR(191) NOT NULL,
    `emp_headquarters` VARCHAR(128) NULL,
    `region` VARCHAR(128) NULL,
    `zone` VARCHAR(128) NULL,
    `l1_manager` VARCHAR(191) NULL,
    `l1_manager_id` VARCHAR(32) NULL,

    UNIQUE INDEX `employee_table_emp_username_key`(`emp_username`),
    PRIMARY KEY (`emp_employee_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doctor_table` (
    `id` VARCHAR(191) NOT NULL,
    `doctor_name` VARCHAR(191) NOT NULL,
    `doctor_code` VARCHAR(64) NOT NULL,
    `specialty` VARCHAR(191) NULL,
    `image_url` TEXT NULL,
    `interview_token` VARCHAR(191) NOT NULL,
    `interview_status` ENUM('DRAFT', 'SENT', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED') NOT NULL DEFAULT 'SENT',
    `created_by_employee_id` VARCHAR(32) NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `opened_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `doctor_table_interview_token_key`(`interview_token`),
    INDEX `doctor_table_created_by_employee_id_idx`(`created_by_employee_id`),
    INDEX `doctor_table_doctor_code_idx`(`doctor_code`),
    INDEX `doctor_table_interview_status_idx`(`interview_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `question_table` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `order` INTEGER NOT NULL,
    `avatar_video_url` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `question_table_slug_key`(`slug`),
    UNIQUE INDEX `question_table_order_key`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_table` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(512) NOT NULL,
    `bucket` VARCHAR(191) NOT NULL,
    `endpoint` TEXT NULL,
    `mime_type` VARCHAR(128) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `duration_seconds` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `asset_table_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `answer_recording_table` (
    `id` VARCHAR(191) NOT NULL,
    `doctor_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `attempt_number` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('UPLOADING', 'READY', 'FAILED') NOT NULL DEFAULT 'READY',
    `accepted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `answer_recording_table_doctor_id_idx`(`doctor_id`),
    INDEX `answer_recording_table_question_id_idx`(`question_id`),
    UNIQUE INDEX `answer_recording_table_doctor_id_question_id_attempt_number_key`(`doctor_id`, `question_id`, `attempt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `doctor_table` ADD CONSTRAINT `doctor_table_created_by_employee_id_fkey` FOREIGN KEY (`created_by_employee_id`) REFERENCES `employee_table`(`emp_employee_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer_recording_table` ADD CONSTRAINT `answer_recording_table_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctor_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer_recording_table` ADD CONSTRAINT `answer_recording_table_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `question_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `answer_recording_table` ADD CONSTRAINT `answer_recording_table_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `asset_table`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
