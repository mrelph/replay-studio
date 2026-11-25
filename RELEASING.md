# Releasing Replay Studio

Replay Studio auto-updates itself on Linux (AppImage) and Windows (NSIS installer)
via [electron-updater](https://www.electron.build/auto-update), reading from
GitHub Releases on `mrelph/replay-studio`. A macOS build (Apple silicon dmg) is
published with each release too, but it does not auto-update; see Caveats.

## Cutting a release

1. Make sure `main` (or whichever branch you're releasing from) is clean and
   has everything you want to ship.
2. Bump the version and let npm create the commit + tag:
   ```sh
   npm version patch   # or: minor / major
   ```
   This updates `package.json`'s `version`, commits it, and creates a matching
   `vX.Y.Z` git tag.
3. Push both:
   ```sh
   git push && git push --tags
   ```
4. Watch the **Release** workflow in the GitHub Actions tab
   (`.github/workflows/release.yml`). It runs on every `v*` tag push, on a
   `ubuntu-latest` + `windows-latest` + `macos-latest` matrix:
   - Verifies the tag matches `package.json`'s version (fails fast if not —
     re-tag or bump the version and try again).
   - `npm ci`, `npm run typecheck`, `npm test`.
   - `vite build && electron-builder --publish always`, which builds the
     Linux AppImage / Windows NSIS installer / macOS dmg and uploads them — along with
     `latest-linux.yml` / `latest.yml`, the update-feed metadata
     electron-updater reads — to a GitHub Release matching the tag.
   - The workflow needs `contents: write` (already set) so it can publish the
     release; no extra repo settings should be required beyond Actions being
     enabled with the default `GITHUB_TOKEN` permissions.
5. Once all three jobs finish, the release is published automatically (not left as
   a draft) with the built installers attached.

## What users see

- On launch, and every 4 hours while the app is running, it quietly checks
  GitHub Releases for a newer version.
- If one is found, it downloads in the background — no interruption, no
  progress dialog.
- Once downloaded, a small "Update ready — vX.Y.Z" banner appears in the
  bottom-right corner with **Restart now** / **Later**. It's never modal, so
  it won't interrupt an export or a presentation (Audience View).
  - **Restart now** quits and relaunches immediately with the update applied.
  - **Later** dismisses the banner for that session; the update installs
    automatically the next time the user quits the app on their own
    (`autoInstallOnAppQuit`).
- Help → **Check for Updates…** runs a check on demand and reports the result
  (up to date / downloading / not supported for this install / error) in a
  native dialog, along with the current version.

## Caveats

- **Linux: AppImage only auto-updates.** If a user installed Replay Studio a
  different way (e.g. a `.deb` or a distro package, if one ever exists), it
  cannot self-update — electron-updater has no supported update mechanism for
  those install types. The app silently skips the update check rather than
  erroring, but "Check for Updates…" will report "not supported for this
  install type" so the user isn't left guessing. Point Linux users at the
  AppImage if they want auto-updates.
- **Windows: the installer is unsigned.** Windows SmartScreen will likely warn
  ("Windows protected your PC") the first time someone runs a fresh install or
  a manually-downloaded update. There's no code-signing certificate yet.
  Auto-updates themselves aren't affected once the app is already installed
  and trusted locally — this only affects the initial download/run prompt.
- **macOS: manual download, no auto-update.** The dmg is built for Apple
  silicon only and is ad-hoc signed, not signed with a Developer ID or
  notarised, because there is no Apple Developer account yet. Consequences:
  - The app cannot update itself (macOS only accepts updates for a Developer
    ID signed app, and `electron/updater.ts` reports updates as unsupported on
    macOS). Mac users download the new dmg from the release page.
  - Gatekeeper blocks the first launch of a downloaded copy. Open it once,
    then go to System Settings → Privacy & Security and choose **Open
    Anyway**; or run `xattr -dr com.apple.quarantine "/Applications/Replay Studio.app"`.
  - Intel Macs are not covered: `ffmpeg-static` bundles the binary for the
    build machine's architecture, and the runner is Apple silicon.
  - To switch on signing and auto-update later: add `CSC_LINK` and
    `CSC_KEY_PASSWORD` (the Developer ID Application certificate as base64
    .p12 and its password) and `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
    `APPLE_TEAM_ID` as repo secrets and pass them to the build step; remove
    `"identity": "-"` from `build.mac` in `package.json` and
    `CSC_IDENTITY_AUTO_DISCOVERY` from the workflow; add a `zip` target next
    to `dmg` (the updater needs it) and `notarize: true`; then allow `darwin`
    in `updatesAreSupported`.
