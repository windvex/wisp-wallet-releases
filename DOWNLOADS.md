# Wisp Wallet download statistics

Updated: **2026-08-17T14:49:41.685Z**

- Total APK downloads: **0**
- Versions with APK assets: **0**
- Uploaded APK assets counted: **0**

> GitHub counts downloads per release asset. These figures are not unique users, devices, or installations. Only uploaded `.apk` assets are included; drafts, checksums, source archives, and non-APK files are excluded.

## Downloads by version

| Version | Published (UTC) | Channel | APK assets | Downloads |
|---|---:|---|---:|---:|
| — | — | — | 0 | 0 |

## Exact asset counts

## Method

The generator requests every published release from the GitHub Releases REST API, paginates at 100 releases per page, filters to assets whose state is `uploaded` and filename ends in `.apk`, then sums the API's `download_count` field per version and for the repository total.

