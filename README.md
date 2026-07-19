# Wisp Wallet for Android

Official APK distribution repository for Wisp Wallet while Google Play distribution is being prepared.

## Download

Install APK files only from this repository's [Releases](https://github.com/windvex/wisp-wallet-releases/releases) page. Each release includes a SHA-256 checksum for verification.

Current GitHub builds target 64-bit Android devices (`arm64-v8a`) and may be marked as prerelease while testing continues.

## Security

- Wisp will never ask for a seed phrase, private key, PIN, or password through GitHub.
- Do not install APK files reposted by third parties.
- Verify the published SHA-256 checksum before installation.
- Back up wallet recovery information securely before replacing or removing an installed wallet.

GitHub APKs use a dedicated distribution certificate. A future Google Play build may use a different Play App Signing certificate and therefore may not update this installation in place.

## Signing certificate

SHA-256:

```text
4A:E2:A2:A2:3C:B0:8B:AD:13:6C:65:CD:AB:50:5B:9F:62:43:1F:8E:DE:8D:64:87:00:6A:53:C0:C7:FA:26:8F
```

The public certificate is available as [`wisp-github-release-certificate.pem`](./wisp-github-release-certificate.pem). The private signing key is not stored in this repository.
