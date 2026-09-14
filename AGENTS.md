# Cryptosino project instructions

## Casino patch versioning

- Treat `frontend/src/casino/version.json` as the single source of truth for the deployed casino patch.
- Before committing any change that affects the casino, including small visual, gameplay, networking, server, documentation, or configuration changes, increment the patch component exactly once (`0.0.1` -> `0.0.2`).
- Never reuse a casino version that has already been committed or pushed.
- Group all changes intended for one deployment into one version bump. If another change is committed afterward, bump again.
- Start the commit subject with `Casino patch X.Y.Z:` using the exact value from `version.json`.
- Run the relevant validation before committing; for frontend casino changes, run `npm run build` from the repository root.
- Keep browser-room version reporting and newest-patch host election compatible with the value in `version.json`.
