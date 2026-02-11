# nswot - CI/CD and Release Specification

> Canonical build and deploy specification for nswot desktop releases.
> This document defines the required GitHub Actions workflows and release behavior.

---

## 1. Goals

- Fully automated build and release flow after merge.
- Multi-platform desktop artifacts for macOS (arm64), Windows, and Linux.
- GitHub Releases as the download surface for end users.
- Automated SemVer + changelog generation.
- Release quality gates before publication.
- Unsigned distribution for now, with a clear migration path to signed releases.

---

## 2. Release Channel

- `main` -> **production release**

All releases come from `main`. No manual release orchestration is required. A prerelease channel (e.g., `beta` or `next` branch) can be added later by expanding the semantic-release `branches` config.

---

## 3. Tooling Decisions

### 3.1 CI/CD Platform

- **GitHub Actions** for CI, build matrix, and release automation.

### 3.2 Versioning and Changelog

- **Semantic Release** (`semantic-release`) is the source of truth for:
  - version bumping (SemVer)
  - git tags
  - changelog/release notes generation
#### Required semantic-release configuration

```json
{
  "branches": ["main"],
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/github"
  ]
}
```

This produces production versions from `main`: `v1.0.0`, `v1.1.0`, `v1.1.1`, etc.

The `@semantic-release/npm` plugin is intentionally omitted — this is a desktop app, not a published npm package. A prerelease channel can be added later by expanding `branches` (e.g., `{ "name": "next", "prerelease": "beta" }`).

### 3.3 Commit Style Requirement

- **Conventional Commits** are required for deterministic versioning:
  - `feat:` -> minor
  - `fix:` -> patch
  - `feat!:` / `BREAKING CHANGE:` -> major
  - `chore/docs/test/refactor:` -> no release unless configured otherwise

If commit messages do not follow convention, release automation will not behave predictably.

---

## 4. Workflow Inventory

Two workflows are required.

1. `ci.yml` — validates quality gates on PR and push.
2. `release.yml` — runs after CI success; computes version, creates release, builds artifacts across OS matrix, and uploads to GitHub Releases.

This keeps CI fast for PR feedback while gating releases on CI success. Version calculation and platform builds live in the same workflow so build jobs have direct access to the release job's outputs (tag, version). Individual matrix legs can still be rerun independently from the Actions UI.

---

## 5. Workflow Contracts

### 5.1 `ci.yml`

#### Triggers

- `pull_request` targeting `main`
- `push` to `main`

#### Required jobs

- `typecheck`
- `test` (all unit + integration tests via `pnpm test`)

Lint is deferred until ESLint tooling is added to the project. When added, include a `lint` job here and add it to branch protection required checks.

#### Required status checks

All jobs above are required for merge into `main`.

No per-OS smoke builds in CI — platform builds are validated during release only. This keeps PR feedback fast.

---

### 5.2 `release.yml`

#### Trigger

```yaml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
```

This ensures `release.yml` runs only after `ci.yml` completes on a push to `main`. PR-triggered CI runs do not match the branch filter and will not trigger a release.

#### Gate check

The first step must verify that the triggering CI run succeeded:

```yaml
jobs:
  gate:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
```

If CI failed, the entire workflow is skipped.

#### Job 1: `release` (runs on `ubuntu-latest`)

- Checkout the `main` branch with full history.
- Run `semantic-release` once (single authoritative version decision).
- Create a **production release** with generated notes.
- Emit job outputs:
  - `released` (boolean)
  - `git_tag` (example: `v1.4.0`)
  - `version`

If no releasable commits are present, the job exits cleanly with `released=false` and the build matrix is skipped.

#### Job 2: `build` (matrix, needs `release`)

Runs only when `release.outputs.released == 'true'`.

##### Matrix

```yaml
os: [macos-latest, windows-latest, ubuntu-latest]
```

- `macos-latest` (arm64 Apple Silicon)
- `windows-latest`
- `ubuntu-latest`

##### Steps per OS

1. Checkout repository at the release tag (`release.outputs.git_tag`).
2. Setup Node (>=22) + pnpm (>=9) with dependency caching.
3. Install dependencies with `--frozen-lockfile`.
4. Rebuild native modules: `pnpm rebuild:electron`.
5. Build and package: `pnpm build && pnpm exec electron-builder --publish never`.
6. Upload generated artifacts to the GitHub Release identified by `git_tag` (use `gh release upload` or `softprops/action-gh-release`).

##### Artifact scope

Use electron-builder default deliverables per OS:
- macOS: `.dmg` + `.zip` (arm64 only)
- Windows: `.exe` (NSIS installer)
- Linux: `.AppImage`

---

## 6. Branch Lifecycle

### Branch model

```text
main (production releases)
  │
  └── feature branches (PR -> main)
```

All feature work targets `main` via pull request. Every merge to `main` with releasable commits (`feat:`, `fix:`, etc.) triggers a production release.

### Future: prerelease channel

When a prerelease channel is needed, add a `next` or `beta` branch and expand `.releaserc.json`:

```json
{
  "branches": [
    "main",
    { "name": "next", "prerelease": "beta" }
  ]
}
```

Then update `ci.yml` and `release.yml` branch filters to include the new branch.

---

## 7. Build and Artifact Rules

- Build per platform on matching runner OS (no cross-compilation).
- macOS builds target arm64 only. Intel (x64) macOS support is deferred — add a second macOS matrix entry with `macos-13` (x64 runner) when needed.
- Artifacts are uploaded only for release tags generated by `semantic-release`.
- Release assets must be downloadable directly from GitHub Releases.
- Keep workflow artifacts (intermediate CI artifacts) retention short (7 days).
- Keep GitHub Release assets permanent unless manually removed.

---

## 8. Unsigned Distribution Policy (Current)

Signing is intentionally disabled for now.

### Current behavior

- macOS, Windows, and Linux artifacts are published unsigned.
- README and release notes must include platform-specific bypass instructions.

#### macOS (Gatekeeper blocks unsigned apps by default)

> Right-click the app and choose **Open**, or go to **System Settings > Privacy & Security** and click **Open Anyway** after the first blocked launch attempt.

#### Windows (SmartScreen blocks unknown publishers)

> Click **More info** on the SmartScreen dialog, then click **Run anyway**.

#### Linux

> AppImage may need `chmod +x` before first run: `chmod +x nswot-*.AppImage`

### Future migration (not in current implementation)

When signing is introduced:

- Add signing/notarization secrets.
- Enforce signed artifacts in release gates.
- Remove unsigned warning language.

---

## 9. Secrets and Configuration

### 9.1 Required now

- `GITHUB_TOKEN` (provided by GitHub Actions automatically).
- Repository permissions in workflows:
  - `contents: write` (create releases, upload assets, push tags)
  - `actions: read`

### 9.2 Optional now / future signing

- Apple signing and notarization secrets (future).
- Windows Authenticode certificate secrets (future).

Do not gate current releases on signing secrets while unsigned policy is active.

---

## 10. Concurrency, Caching, and Retry

- Concurrency group per workflow per branch; cancel stale in-progress runs:
  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: true
  ```
- Enable pnpm dependency caching (`actions/setup-node` with `cache: 'pnpm'`) in all workflows.
- If a single build matrix leg fails, rerun that leg only from the Actions UI — the `release` job is skipped on rerun since the tag already exists.
- `semantic-release` runs in exactly one job, preventing duplicate releases.

---

## 11. Branch Protection Requirements

For `main`:

- Require CI status checks (`typecheck`, `test`) to pass before merge.
- Require squash merge to keep commit history clean and Conventional Commits unambiguous.
- Restrict direct pushes — PR-only merges.

---

## 12. Implementation Acceptance Criteria

- Merging a releasable commit to `main` automatically publishes a production release with assets for macOS/Windows/Linux.
- Releases are versioned by SemVer from Conventional Commit history.
- Release notes/changelog are generated automatically.
- If no releasable commit exists, no release is created and workflow exits successfully.
- CI gates block release publication when typecheck or tests fail.
- A failed build matrix leg can be rerun without re-running version calculation.

---

## 13. Implementation Prerequisites

Before implementing workflows, the following must exist in the repository:

- [ ] `@electron/rebuild` added to `devDependencies` (currently used via `npx`, must be pinned for reproducible CI builds)
- [ ] `semantic-release` and required plugins added to `devDependencies`
- [ ] `.releaserc.json` with the `branches` config from section 3.2
- [ ] `win` target section added to `electron-builder.yml`
- [ ] ESLint setup (deferred — add `lint` to CI jobs and branch protection when ready)
- [ ] Unsigned-install bypass instructions added to README

---

## 14. Out of Scope (This Spec)

- E2E tests as blocking release gates.
- Mandatory code signing/notarization.
- Non-GitHub distribution channels.
- Auto-update infrastructure (Sparkle/Squirrel/electron-updater).
- macOS x64 (Intel) builds.
