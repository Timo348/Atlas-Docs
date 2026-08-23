-- Atlas 2.1 stored PDF page bodies in PageAsset. The current FILE model keeps
-- the binary directly on Page. Only old databases have the PageAsset table, so
-- use dynamic SQL to keep fresh installations migration-safe.
DO $$
BEGIN
  IF to_regclass('public."PageAsset"') IS NOT NULL THEN
    EXECUTE $migration$
      WITH latest_document_assets AS (
        SELECT DISTINCT ON (asset."pageId")
          asset."pageId",
          asset."data",
          asset."mime",
          asset."size"
        FROM "PageAsset" AS asset
        JOIN "Page" AS page ON page."id" = asset."pageId"
        WHERE asset."kind"::text = 'DOCUMENT'
          AND page."format"::text = 'FILE'
          AND page."fileData" IS NULL
        ORDER BY asset."pageId", asset."createdAt" DESC
      )
      UPDATE "Page" AS page
      SET
        "fileData" = asset."data",
        "fileMime" = COALESCE(NULLIF(asset."mime", ''), 'application/pdf'),
        "fileSize" = COALESCE(page."fileSize", asset."size", octet_length(asset."data"))
      FROM latest_document_assets AS asset
      WHERE page."id" = asset."pageId";
    $migration$;
  END IF;
END $$;
