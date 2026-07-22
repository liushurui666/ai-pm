-- 版本总体负责人对齐 one2all owner_user_id：仅作为版本级权限事实，不自动放大为项目交付经理。
-- 字段保持 nullable；历史数据按产品、开发、设计负责人顺序选择同一角色整组回填，避免姓名与身份来自不同成员。
ALTER TABLE `project_versions`
  ADD COLUMN `owner` VARCHAR(191) NULL,
  ADD COLUMN `ownerMemberId` VARCHAR(191) NULL,
  ADD COLUMN `ownerOpenId` VARCHAR(191) NULL,
  ADD COLUMN `ownerUnionId` VARCHAR(191) NULL,
  ADD COLUMN `ownerUserId` VARCHAR(191) NULL,
  ADD COLUMN `ownerEmail` VARCHAR(191) NULL,
  ADD COLUMN `ownerAvatarUrl` VARCHAR(1024) NULL;

UPDATE `project_versions`
SET
  `owner` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwner`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwner`
    ELSE `uiOwner`
  END,
  `ownerMemberId` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerMemberId`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerMemberId`
    ELSE `uiOwnerMemberId`
  END,
  `ownerOpenId` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerOpenId`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerOpenId`
    ELSE `uiOwnerOpenId`
  END,
  `ownerUnionId` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerUnionId`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerUnionId`
    ELSE `uiOwnerUnionId`
  END,
  `ownerUserId` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerUserId`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerUserId`
    ELSE `uiOwnerUserId`
  END,
  `ownerEmail` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerEmail`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerEmail`
    ELSE `uiOwnerEmail`
  END,
  `ownerAvatarUrl` = CASE
    WHEN NULLIF(TRIM(`productOwner`), '') IS NOT NULL THEN `productOwnerAvatarUrl`
    WHEN NULLIF(TRIM(`devOwner`), '') IS NOT NULL THEN `devOwnerAvatarUrl`
    ELSE `uiOwnerAvatarUrl`
  END;

CREATE INDEX `project_versions_ownerMemberId_idx` ON `project_versions`(`ownerMemberId`);
