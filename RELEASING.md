# Atlas Docs release checklist

This file defines the required release process for Atlas Docs maintainers. It
is intentionally version-independent so configuration and Compose changes stay
visible in every future release.

## Mandatory upgrade-note check

Before publishing a release, compare it with the previous tag:

```bash
git diff --stat <previous-tag>..<release-tag>
git diff <previous-tag>..<release-tag> -- .env.example compose.yml 'compose.*.yml' prisma/migrations
```

Every GitHub release and matching entry in `PATCH_NOTES.md` must contain an
**Upgrade notes** section. If the comparison changes `.env.example`, a Compose
file, or database migrations, that section must state:

- every new, removed, or renamed variable, including its unit and default;
- which release deployment files operators must replace or merge;
- whether the migration is additive and what rollback requires;
- the exact target `ATLAS_VERSION` and the validation/start commands.

If none of those files changed, the section must explicitly say that no
configuration, Compose, or database migration step is required. Never advise
operators to overwrite their secret `.env` with `.env.example`; they must merge
the documented differences into the existing file.

## Publication and verification

1. Audit `.gitignore` and `.dockerignore`, then run Prisma validation, lint,
   tests, the production build, database migrations on a fresh database, and a
   health check of the production Compose stack.
2. Commit and tag the exact validated tree. Push the default branch and release
   tag, then create the GitHub release from the prepared patch notes.
3. Publish matching `web`, `collab`, and `migrate` images under the full version,
   minor, major, and `latest` tags. Do not mix service versions.
4. Independently verify the remote Git commit/tag, release text, image digests,
   migration completion, and web/collaboration health from the published
   images.
