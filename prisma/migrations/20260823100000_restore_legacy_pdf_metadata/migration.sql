-- Before uploaded files were generalized to FILE, legacy PDFs stored their
-- content without file metadata. Current imports always persist a MIME type,
-- so a binary FILE without one is a migrated legacy PDF.
UPDATE "Page"
SET
  "fileMime" = 'application/pdf',
  "fileSize" = COALESCE("fileSize", octet_length("fileData"))
WHERE "format" = 'FILE'
  AND "fileData" IS NOT NULL
  AND "fileMime" IS NULL;
