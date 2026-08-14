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

## One-time setup: the `NPM_TOKEN` secret

Publishing needs an npm access token stored as a repository secret named
`NPM_TOKEN`:

1. On [npmjs.com](https://www.npmjs.com/) → **Access Tokens** → **Generate New
   Token** → **Granular Access Token** (recommended) with **Read and write**
   permission scoped to the `altis-cli` package. Use an **Automation** token so
   it bypasses 2FA in CI.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository
   secret**, name it `NPM_TOKEN`, and paste the token.

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
