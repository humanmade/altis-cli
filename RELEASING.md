# Releasing altis-cli

Releases are published to [npm](https://www.npmjs.com/package/altis-cli)
automatically by GitHub Actions whenever a **GitHub Release is published**.
`package.json` is the single source of truth for the version number.

## Versioning (SemVer)

We follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`.

- **patch** (`x.y.Z`) — bug fixes and internal changes; no change to how the
  CLI is used.
- **minor** (`x.Y.0`) — new commands, options, or output that are
  backwards-compatible.
- **major** (`X.0.0`) — breaking changes: removed/renamed commands or flags, or
  changed behaviour/output that could break existing scripts.

## Cutting a release

1. Make sure `main` is green in CI and you have the latest:

   ```sh
   git checkout main && git pull
   ```

2. Bump the version. This updates `package.json` and creates a matching
   `vX.Y.Z` commit and git tag:

   ```sh
   npm version patch   # or: minor | major
   ```

3. Push the commit and tag:

   ```sh
   git push --follow-tags
   ```

4. Create a **GitHub Release** for the new `vX.Y.Z` tag
   (Releases → Draft a new release → choose the tag → add notes → Publish).

Publishing the release triggers `.github/workflows/release.yml`, which:

- installs dependencies (`npm ci`),
- **verifies the release tag matches `package.json`** (fails otherwise),
- runs the CLI smoke test,
- runs `npm audit` (advisory — does not block the release),
- publishes to npm with [provenance](https://docs.npmjs.com/generating-provenance-statements).

## One-time setup: trusted publishing

Publishing authenticates to npm as a
[trusted publisher](https://docs.npmjs.com/trusted-publishers) via OIDC — no
token or repository secret is required.

A package admin configures this once on npmjs.com. If the config is ever lost,
or you set this up for another package, these are the fields — npm matches them
exactly and they are **case-sensitive**:

1. Go to the [`altis-cli` package](https://www.npmjs.com/package/altis-cli) →
   **Settings** → **Trusted publisher** → **GitHub Actions**.
2. Organization or user: `humanmade`
3. Repository: `altis-cli`
4. Workflow filename: `release.yml` (exactly, including the `.yml`)
5. Environment: **leave blank** — this repo has no GitHub environments
   configured, so anything entered here will cause the publish to fail.

The workflow grants `id-token: write` (for the OIDC exchange) and upgrades npm
to a version new enough to support trusted publishing (npm 11.5.1+).

Provenance additionally requires the repository to be public and the
`repository` field in `package.json` to be set (both already true).

## Rollback

npm does **not** allow un-publishing a version after 72 hours (and discourages
it before that). To handle a bad release:

- Mark it deprecated so users are warned:

  ```sh
  npm deprecate altis-cli@X.Y.Z "Broken release — upgrade to X.Y.(Z+1)"
  ```

- Fix forward: cut a new patch release with the fix.
