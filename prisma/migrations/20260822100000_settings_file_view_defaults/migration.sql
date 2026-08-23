ALTER TABLE "User" ADD COLUMN "fileViewDefaults" JSONB;

UPDATE "User"
SET "fileViewDefaults" = CASE
  WHEN "defaultEditorView" = 'preview' THEN
    '{"markdown":"preview","latex":"preview","mermaid":"diagram","gantt":"diagram"}'::jsonb
  ELSE
    '{"markdown":"write","latex":"write","mermaid":"source-and-diagram","gantt":"source-and-diagram"}'::jsonb
END;

ALTER TABLE "User"
  ALTER COLUMN "fileViewDefaults"
  SET DEFAULT '{"markdown":"write","latex":"write","mermaid":"source-and-diagram","gantt":"source-and-diagram"}'::jsonb;

ALTER TABLE "User"
  ALTER COLUMN "fileViewDefaults"
  SET NOT NULL;
