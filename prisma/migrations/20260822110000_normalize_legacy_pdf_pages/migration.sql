-- Older Atlas installations could persist uploaded PDFs as a separate PageFormat
-- value. PDFs are now represented by the generic FILE format and retain their
-- binary data and MIME type, so only the legacy format discriminator changes.
UPDATE "Page"
SET "format" = 'FILE'::"PageFormat"
WHERE "format"::text = 'PDF';
