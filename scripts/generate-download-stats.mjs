import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repository = process.env.GITHUB_REPOSITORY || "windvex/wisp-wallet-releases";
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const token = process.env.GITHUB_TOKEN || "";
const fixturePath = process.env.DOWNLOAD_STATS_FIXTURE || "";
const outputRoot = process.cwd();

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

async function fetchPublishedReleases() {
  if (fixturePath) {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
    if (!Array.isArray(fixture)) {
      throw new Error("DOWNLOAD_STATS_FIXTURE must contain a JSON array");
    }
    return fixture.filter((release) => !release?.draft);
  }

  const releases = [];
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wisp-wallet-release-download-stats",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let page = 1; ; page += 1) {
    const url = new URL(`${apiBase}/repos/${repository}/releases`);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `GitHub releases API returned ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error("GitHub releases API returned a non-array response");
    }

    releases.push(...batch.filter((release) => !release?.draft));
    if (batch.length < 100) break;
  }

  return releases;
}

function buildStatistics(releases) {
  const versions = releases
    .map((release) => {
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const apkAssets = assets
        .filter(
          (asset) =>
            asset?.state === "uploaded" &&
            typeof asset?.name === "string" &&
            asset.name.toLowerCase().endsWith(".apk"),
        )
        .map((asset) => ({
          name: asset.name,
          downloads: Number.isFinite(Number(asset.download_count))
            ? Number(asset.download_count)
            : 0,
          size: Number.isFinite(Number(asset.size)) ? Number(asset.size) : 0,
          updatedAt: asset.updated_at || asset.created_at || null,
          url: asset.browser_download_url || null,
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

      const downloads = apkAssets.reduce(
        (total, asset) => total + asset.downloads,
        0,
      );

      return {
        tag: String(release.tag_name || release.name || `release-${release.id}`),
        name: String(release.name || release.tag_name || "Unnamed release"),
        publishedAt: release.published_at || release.created_at || null,
        prerelease: Boolean(release.prerelease),
        url: release.html_url || null,
        downloads,
        apkAssets,
      };
    })
    .filter((release) => release.apkAssets.length > 0)
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt || "") || 0;
      const rightTime = Date.parse(right.publishedAt || "") || 0;
      return leftTime - rightTime || left.tag.localeCompare(right.tag);
    });

  const totalDownloads = versions.reduce(
    (total, release) => total + release.downloads,
    0,
  );
  const totalAssets = versions.reduce(
    (total, release) => total + release.apkAssets.length,
    0,
  );

  return {
    repository,
    generatedAt: new Date().toISOString(),
    totalDownloads,
    totalVersions: versions.length,
    totalAssets,
    versions,
  };
}

function makeBadge(statistics) {
  const label = "APK downloads";
  const value = formatCount(statistics.totalDownloads);
  const labelWidth = 104;
  const valueWidth = Math.max(52, value.length * 8 + 18);
  const width = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <title>${escapeXml(label)}: ${escapeXml(value)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#2ea44f"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(label)}</text>
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(value)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${escapeXml(value)}</text>
  </g>
</svg>
`;
}

function makeBarChart(statistics) {
  const rows = statistics.versions;
  const width = 960;
  const margin = { top: 78, right: 92, bottom: 54, left: 250 };
  const rowHeight = 44;
  const plotWidth = width - margin.left - margin.right;
  const height = Math.max(250, margin.top + margin.bottom + rows.length * rowHeight);
  const maxDownloads = Math.max(1, ...rows.map((row) => row.downloads));
  const gridSteps = 4;
  const tickValues = Array.from(
    { length: gridSteps + 1 },
    (_, index) => Math.round((maxDownloads * index) / gridSteps),
  );

  const grid = tickValues
    .map((value) => {
      const x = margin.left + (value / maxDownloads) * plotWidth;
      return `  <line x1="${x.toFixed(2)}" y1="${margin.top - 10}" x2="${x.toFixed(2)}" y2="${height - margin.bottom}" stroke="#d0d7de" stroke-dasharray="4 5"/>
  <text x="${x.toFixed(2)}" y="${height - margin.bottom + 24}" text-anchor="middle" class="axis">${escapeXml(formatCount(value))}</text>`;
    })
    .join("\n");

  const bars = rows.length
    ? rows
        .map((row, index) => {
          const y = margin.top + index * rowHeight;
          const barWidth = (row.downloads / maxDownloads) * plotWidth;
          const tag = row.prerelease ? `${row.tag} · prerelease` : row.tag;
          return `  <text x="${margin.left - 14}" y="${y + 19}" text-anchor="end" class="label">${escapeXml(tag)}</text>
  <rect x="${margin.left}" y="${y}" width="${Math.max(1, barWidth).toFixed(2)}" height="26" rx="6" fill="#2ea44f"/>
  <text x="${Math.min(width - 12, margin.left + Math.max(1, barWidth) + 10).toFixed(2)}" y="${y + 19}" class="value">${escapeXml(formatCount(row.downloads))}</text>`;
        })
        .join("\n")
    : `  <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="empty">No uploaded APK assets found</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Wisp Wallet APK downloads by version</title>
  <desc id="description">Bar chart generated from GitHub release asset download counts. Total ${statistics.totalDownloads} downloads across ${statistics.totalVersions} versions.</desc>
  <style>
    .title { font: 700 24px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill: #1f2328; }
    .subtitle,.axis { font: 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill: #59636e; }
    .label { font: 600 13px ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; fill: #1f2328; }
    .value { font: 700 13px ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace; fill: #1f2328; }
    .empty { font: 600 16px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; fill: #59636e; }
    @media (prefers-color-scheme: dark) {
      .title,.label,.value { fill: #f0f6fc; }
      .subtitle,.axis,.empty { fill: #8c959f; }
      line { stroke: #30363d; }
    }
  </style>
  <rect width="100%" height="100%" rx="14" fill="#ffffff" fill-opacity="0"/>
  <text x="28" y="36" class="title">APK downloads by version</text>
  <text x="28" y="58" class="subtitle">Exact GitHub asset counts · APK files only · updated ${escapeXml(formatDate(statistics.generatedAt))}</text>
${grid}
${bars}
  <text x="${margin.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle" class="axis">Downloads</text>
</svg>
`;
}

function makeMarkdown(statistics) {
  const lines = [
    "# Wisp Wallet download statistics",
    "",
    `Updated: **${statistics.generatedAt}**`,
    "",
    `- Total APK downloads: **${formatCount(statistics.totalDownloads)}**`,
    `- Versions with APK assets: **${formatCount(statistics.totalVersions)}**`,
    `- Uploaded APK assets counted: **${formatCount(statistics.totalAssets)}**`,
    "",
    "> GitHub counts downloads per release asset. These figures are not unique users, devices, or installations. Only uploaded `.apk` assets are included; drafts, checksums, source archives, and non-APK files are excluded.",
    "",
    "## Downloads by version",
    "",
    "| Version | Published (UTC) | Channel | APK assets | Downloads |",
    "|---|---:|---|---:|---:|",
  ];

  if (!statistics.versions.length) {
    lines.push("| — | — | — | 0 | 0 |");
  } else {
    for (const release of [...statistics.versions].reverse()) {
      const version = release.url
        ? `[${escapeMarkdown(release.tag)}](${release.url})`
        : escapeMarkdown(release.tag);
      lines.push(
        `| ${version} | ${formatDate(release.publishedAt)} | ${release.prerelease ? "Prerelease" : "Stable"} | ${formatCount(release.apkAssets.length)} | **${formatCount(release.downloads)}** |`,
      );
    }
  }

  lines.push("", "## Exact asset counts", "");

  for (const release of [...statistics.versions].reverse()) {
    lines.push(`### ${release.tag}`, "");
    lines.push("| APK asset | Size | Downloads |", "|---|---:|---:|");
    for (const asset of release.apkAssets) {
      const assetName = asset.url
        ? `[${escapeMarkdown(asset.name)}](${asset.url})`
        : escapeMarkdown(asset.name);
      lines.push(
        `| ${assetName} | ${(asset.size / 1024 / 1024).toFixed(1)} MB | ${formatCount(asset.downloads)} |`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Method",
    "",
    "The generator requests every published release from the GitHub Releases REST API, paginates at 100 releases per page, filters to assets whose state is `uploaded` and filename ends in `.apk`, then sums the API's `download_count` field per version and for the repository total.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

function comparableStatistics(statistics) {
  const { generatedAt: _generatedAt, ...comparable } = statistics;
  return comparable;
}

async function readExistingStatistics() {
  try {
    return JSON.parse(
      await readFile(path.join(outputRoot, "download-stats.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

async function main() {
  const releases = await fetchPublishedReleases();
  const statistics = buildStatistics(releases);
  const existing = await readExistingStatistics();

  if (
    existing &&
    JSON.stringify(comparableStatistics(existing)) ===
      JSON.stringify(comparableStatistics(statistics))
  ) {
    console.log(
      `Download counts unchanged: ${statistics.totalDownloads} downloads across ${statistics.totalVersions} versions`,
    );
    return;
  }

  const assetsDirectory = path.join(outputRoot, "assets");
  await mkdir(assetsDirectory, { recursive: true });

  await Promise.all([
    writeFile(
      path.join(outputRoot, "download-stats.json"),
      `${JSON.stringify(statistics, null, 2)}\n`,
    ),
    writeFile(path.join(outputRoot, "DOWNLOADS.md"), makeMarkdown(statistics)),
    writeFile(path.join(assetsDirectory, "downloads-badge.svg"), makeBadge(statistics)),
    writeFile(
      path.join(assetsDirectory, "downloads-by-version.svg"),
      makeBarChart(statistics),
    ),
  ]);

  console.log(
    `Generated exact APK statistics: ${statistics.totalDownloads} downloads across ${statistics.totalVersions} versions`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
