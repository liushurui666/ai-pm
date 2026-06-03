-- AlterTable
ALTER TABLE `workspace_members`
    ADD COLUMN `registrationChannel` VARCHAR(191) NOT NULL DEFAULT 'email';
