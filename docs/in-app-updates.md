# In-app runtime updates

Signed runtime updates work with iOS loaders starting at 0.4.0 and Android launchers starting at 0.4.14. On Android, install the new launcher and choose **Reinstall Moggcord** once to embed the updater in the Discord copy. **Settings → Moggcord updates → Update and restart** downloads the shared JavaScript runtime and reloads Discord. Updating Discord or changing the native loader still requires a new signed application.

## Distribution

The public update entry points are `https://moggcord.cc/mobile/updates/ios/manifest.json` and `https://moggcord.cc/mobile/updates/android/manifest.json`. An envelope contains base64-encoded `payload` and `signature` fields. The signature uses ECDSA P-256, DER encoding, and SHA-256 over the exact decoded payload bytes.

The signed payload specifies the schema, runtime version, minimum loader protocol, Discord build, exact download URL, byte length, SHA-256 and source revision. Both native verifiers pin the public key defined in `ios/UpdatePublicKey.h`. Application requests omit Discord credentials.

The native loader verifies downloaded and cached payloads. Pending updates are written atomically. A candidate is marked attempted before it runs and becomes the confirmed runtime only after successful initialization and five seconds of startup. If that confirmation does not happen, the next launch uses the last confirmed runtime or the embedded payload. Settings reports a recovery when this happens. This detects startup failures; it cannot prove that every plugin feature works.

## Publish a runtime

Keep the existing signing key outside the repository and all public packages. Losing the key requires a new loader and public key. Never replace the pinned public key merely to publish a normal update.

1. Finish and commit the complete change, increase the three-part version, run `npm test` and build both native artifacts in GitHub Actions.
2. Run `npm run build` from that exact commit. The bundle must match the payload embedded in the iOS artifact.
3. With Python's `cryptography` package installed, sign the bundle using the existing private key:

   ```sh
   python scripts/sign-mobile-update.py --key /private/path/moggcord-mobile-updates-p256.pem --output dist/manifest.json
   ```

   For Android, add `--platform android --discord-build VERSION_CODE` and use a separate manifest output.

4. Upload `dist/moggcord-mobile.js` to `/mobile/updates/PLATFORM/VERSION/moggcord-mobile.js` and verify its public hash. Keep versioned payloads immutable.
5. Publish the signed envelope at `/mobile/updates/PLATFORM/manifest.json` only after the versioned payload is available. Disable caching for the latest manifest.

Only update manifests matching the installed Discord build and loader protocol are accepted. Publish one grouped release after the source, tests and artifacts are ready. The signing key is not a Windows code-signing certificate or an Apple signing identity.

## Verification

`npm test` exercises native user-menu integration, permissions and the update client. On macOS, `bash scripts/test-ios-updates.sh` exercises the production native verifier and storage with temporary test keys: signature failures, altered payloads, incompatible targets, staging, confirmation and rollback. The iOS GitHub job runs these checks before producing its loader. Real-device confirmation is still required for the Discord reload and profile integration.
