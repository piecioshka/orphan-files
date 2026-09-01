// Posts (or updates) a pull request comment summarising the orphan-files run.
//
// Runs inside the composite action via `node`, so it deliberately avoids any
// dependency on this package's own lib/ - when the action executes it is
// installed from npm into someone else's repository.

import fs from "node:fs";

const MARKER = "<!-- orphan-files-report -->";
const MAX_LISTED = 50;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readReport(path) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf-8"));
  } catch (err) {
    throw new Error(
      `Could not read the JSON report at ${path}: ${err.message}`,
    );
  }
}

// Resolves the PR number for both `pull_request` events and pushes to a branch
// that has an open PR, so the action still comments when run on `push`.
async function resolvePullNumber(api, event) {
  if (event?.pull_request?.number) return event.pull_request.number;

  const sha = process.env.GITHUB_SHA;
  if (!sha) return null;

  const res = await api(`/commits/${sha}/pulls`);
  if (!res.ok) return null;
  const open = (await res.json()).find((pr) => pr.state === "open");
  return open ? open.number : null;
}

function buildBody(report, { serverUrl, repository, runId }) {
  const {
    unusedCount,
    totalFiles,
    reclaimableBytes,
    unusedFiles = [],
  } = report;

  const lines = [
    MARKER,
    "### 🔨 orphan-files",
    "",
    `Found **${unusedCount}** unused ${unusedCount === 1 ? "file" : "files"} ` +
      `out of ${totalFiles} scanned - ${formatBytes(reclaimableBytes)} reclaimable.`,
    "",
  ];

  const listed = unusedFiles.slice(0, MAX_LISTED);
  lines.push("<details>", `<summary>Unused files</summary>`, "");
  lines.push("```");
  lines.push(...listed);
  lines.push("```");
  if (unusedFiles.length > listed.length) {
    lines.push("", `…and ${unusedFiles.length - listed.length} more.`);
  }
  lines.push("</details>", "");

  lines.push(
    "> Nothing reachable from an entry point imports these files. " +
      "Run `npx orphan-files --why <file>` to see why one is reported.",
  );

  if (serverUrl && repository && runId) {
    lines.push(
      "",
      `[Run details](${serverUrl}/${repository}/actions/runs/${runId})`,
    );
  }

  return lines.join("\n");
}

async function main() {
  const reportPath = process.argv[2];
  const token = process.env.COMMENT_TOKEN;

  if (!token) {
    console.log(
      "::warning::No token supplied, skipping the pull request comment.",
    );
    return;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  const apiUrl = process.env.GITHUB_API_URL || "https://api.github.com";

  const api = (path, init = {}) =>
    fetch(`${apiUrl}/repos/${repository}${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });

  let event = null;
  if (process.env.GITHUB_EVENT_PATH) {
    try {
      event = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf-8"),
      );
    } catch {
      event = null;
    }
  }

  const pull = await resolvePullNumber(api, event);
  if (!pull) {
    console.log(
      "::notice::No open pull request for this run, skipping the comment.",
    );
    return;
  }

  const report = readReport(reportPath);

  // A clean run should not add noise, but it must clear a stale report.
  const existing = await findExistingComment(api, pull);
  if (!report.unusedCount) {
    if (!existing) {
      console.log("::notice::No unused files, nothing to comment.");
      return;
    }
    await api(`/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        body: `${MARKER}\n### 🔨 orphan-files\n\nNo unused files found - previously reported files are gone. ✅`,
      }),
    });
    console.log(`Updated comment ${existing.id}: the report is now clean.`);
    return;
  }

  const body = buildBody(report, {
    serverUrl: process.env.GITHUB_SERVER_URL,
    repository,
    runId: process.env.GITHUB_RUN_ID,
  });

  const res = existing
    ? await api(`/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      })
    : await api(`/issues/${pull}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });

  if (!res.ok) {
    const detail = await res.text();
    console.log(
      `::warning::Could not post the pull request comment (HTTP ${res.status}). ${detail}`,
    );
    return;
  }

  console.log(
    `${existing ? "Updated" : "Created"} the orphan-files comment on #${pull}.`,
  );
}

// Finds this action's own comment by its hidden marker, so repeated runs edit
// one comment instead of stacking near-identical ones.
async function findExistingComment(api, pull) {
  for (let page = 1; page <= 10; page++) {
    const res = await api(`/issues/${pull}/comments?per_page=100&page=${page}`);
    if (!res.ok) return null;
    const comments = await res.json();
    const hit = comments.find((c) => c.body?.includes(MARKER));
    if (hit) return hit;
    if (comments.length < 100) return null;
  }
  return null;
}

main().catch((err) => {
  // A failed comment must never fail the build - the scan result is the signal.
  console.log(`::warning::orphan-files could not comment: ${err.message}`);
});
