ALTER TABLE "User" ADD COLUMN "ganttAppearance" JSONB;

UPDATE "User"
SET "ganttAppearance" = '{"dimPastDates":true,"statuses":{"none":{"label":"","color":"#3480c8"},"active":{"label":"","color":"#9b6cc4"},"done":{"label":"","color":"#2f955f"},"crit":{"label":"","color":"#cf5b4e"}}}'::jsonb;

ALTER TABLE "User"
  ALTER COLUMN "ganttAppearance"
  SET DEFAULT '{"dimPastDates":true,"statuses":{"none":{"label":"","color":"#3480c8"},"active":{"label":"","color":"#9b6cc4"},"done":{"label":"","color":"#2f955f"},"crit":{"label":"","color":"#cf5b4e"}}}'::jsonb;

ALTER TABLE "User"
  ALTER COLUMN "ganttAppearance"
  SET NOT NULL;
