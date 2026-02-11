# nswot - Release Operations Runbook

> Operational guide for maintainers running automated GitHub Releases.
> Complements `docs/13-ci-cd-and-release.md`.

---

## 1. Purpose

This runbook defines how to operate and recover the automated release pipeline after it is configured.

Use this document for:

- release health checks
- failed workflow triage
- prerelease vs production release handling
- rollback/recovery decisions

---

## 2. Release Model

- `main` publishes **production releases**
- Releases are fully automated: CI success triggers release + build
- GitHub Releases page is the canonical download location

### Workflow chain

```text
push to main -> ci.yml -> (on success) -> release.yml
                                            ├── release job (semantic-release)
                                            └── build job (OS matrix, uploads artifacts)
```

---

## 3. Ownership and Access

- Maintainers must have permission to:
  - view and rerun Actions workflows
  - edit release metadata
  - delete/recreate incorrect releases if needed
- Branch protection must stay enabled on `main` and `release/*`

---

## 4. Normal Release Verification Checklist

After each release run:

1. Confirm `ci.yml` completed successfully.
2. Confirm `release.yml` completed — both the `release` job and all `build` matrix legs.
3. Open the GitHub Release and verify:
   - version is correct
   - release notes are present
   - macOS (`.dmg`/`.zip`), Windows (`.exe`), and Linux (`.AppImage`) assets exist
4. Download and run one artifact locally as a smoke install.
5. Confirm release notes include unsigned-install bypass instructions.

---

## 5. Failure Triage Playbook

### 5.1 CI gate failure (typecheck/tests)

Symptoms:

- `ci.yml` fails; `release.yml` does not trigger.

Action:

1. Fix failing code/tests in a PR.
2. Merge to target branch.
3. Let automation retry from scratch.

Do not manually publish when CI gates are red.

### 5.2 Versioning/release metadata failure (`release` job)

Symptoms:

- `release.yml` triggers but the `release` job fails.
- No new tag/release created.

Checks:

1. Confirm `GITHUB_TOKEN` permissions include `contents: write`.
2. Confirm branch is `main` or `release/*`.
3. Confirm commit messages follow Conventional Commits (at least one `feat:` or `fix:` since last tag).
4. Confirm `.releaserc.json` `branches` config is correct.

Action:

1. Fix configuration/permissions/commit semantics.
2. Push a corrective commit (e.g., `fix: correct release config`).
3. Rerun the workflow only if root cause is transient (network/runner issue).

### 5.3 Platform build matrix failure (`build` job)

Symptoms:

- Release tag and GitHub Release exist, but one or more platform assets are missing.

Checks:

1. Dependency install issues (lockfile mismatch, registry timeout).
2. Native module rebuild issues (`better-sqlite3` / Electron ABI mismatch).
3. Electron packaging step failure on specific runner.

Action — recover without a new release:

1. **If transient** (runner/network): rerun the failed matrix leg from the Actions UI. The `release` job will be skipped (tag already exists) and the build job will re-upload to the existing release.
2. **If code fix needed**: fix the issue in a PR, merge, and let the next release include the fix.
3. **Manual upload fallback**: build locally on the affected platform and upload via CLI:
   ```bash
   gh release upload v1.2.3 ./dist/nswot-1.2.3-setup.exe
   ```

---

## 6. Partial Release Handling

If release metadata exists but one platform asset is missing:

1. Rerun the failed build matrix leg from the Actions UI (preferred).
2. If rerun fails, upload the missing artifact manually with `gh release upload`.
3. If the release is inconsistent and cannot be repaired, edit the release notes to mark the issue and ship the next patch release as a forward-fix.

Avoid deleting production tags unless absolutely necessary.

---

## 7. Rollback Strategy

There is no binary overwrite rollback in place. Use forward-fix releases.

- If severe issue:
  - edit release notes to mark release as problematic
  - optionally hide/deprecate release in GitHub UI
  - ship immediate patch release from `main`

Policy: prefer **fast patch release** over history rewrite.

---

## 8. Emergency Stop

If automation is producing bad releases:

1. Disable `release.yml` in repository Actions settings (leave `ci.yml` enabled).
2. Patch workflow configuration in a PR to the affected branch.
3. Re-enable `release.yml` after verification.

---

## 9. Maintenance Tasks (Periodic)

- After each release: verify all 3 platform assets exist on the GitHub Release.
- Review workflow duration trends and flaky steps if builds start failing intermittently.
- After cutting a new `release/*` branch, archive the previous release branch.
- Confirm README download guidance still points to the Releases page.

---

## 10. Signing Migration Readiness (Future)

When signing is introduced:

1. Add signing secrets to repo/org.
2. Add signing validation step in `release.yml` build job.
3. Switch docs from unsigned bypass instructions to signed trust guidance.
4. Run one dry-run prerelease before production enforcement.

---

## 11. Runbook Acceptance Criteria

- A maintainer can diagnose release failures without inspecting source code.
- A maintainer can distinguish CI gate failures from release metadata failures from platform build failures.
- A maintainer can recover a partial release (missing platform asset) without shipping a new version.
- A maintainer can recover to a healthy release state within one follow-up patch cycle.
