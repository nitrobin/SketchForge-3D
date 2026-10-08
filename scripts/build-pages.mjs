// Builds a static export of the current commit for the GitHub Pages project site of `origin`
// (https://<owner>.github.io/<repository>/) into out/github-pages, then commits it to the local
// `gh-pages` branch on top of origin/gh-pages. It never pushes: `git push origin gh-pages` publishes.
//
//   npm run pages:build                                   # base path: /<repository name of origin>
//   npm run pages:build -- --no-commit                    # only build out/github-pages
//   npm run pages:build -- --base-path /my-site --out ../site
//   npm run pages:build -- --base-path /                  # site served from a domain root
//   npm run pages:build -- --squash                       # gh-pages keeps only this commit, no history
//
// The build runs in a temporary git worktree of HEAD, so uncommitted changes are not included and
// the working tree (and a running dev server) stays untouched. The server-only API routes are
// removed there first: a static export cannot contain them, and the static build never calls them
// (shared projects, saving to a folder and updates are switched off in static mode).
//
// The site's "View source code" link points at origin, not upstream: AGPL-3.0 section 13 asks a modified
// version served over a network to offer its own source. NEXT_PUBLIC_SOURCE_CODE_URL overrides it.
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { values: options } = parseArgs({
  options: {
    "base-path": { type: "string" },
    out: { type: "string" },
    branch: { type: "string", default: "gh-pages" },
    "no-commit": { type: "boolean", default: false },
    // The Pages branch only ever holds the latest build, so its history can be dropped to keep the
    // repository small. Publishing then rewrites the remote branch (git push --force-with-lease).
    squash: { type: "boolean", default: false },
  },
});

const git = (...args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();

function originUrl() {
  try {
    return git("remote", "get-url", "origin");
  } catch {
    return "";
  }
}

function repositoryName() {
  return basename(originUrl()).replace(/\.git$/, "") || basename(repositoryRoot);
}

/** https://<owner>.github.io/<repository>/ for a GitHub origin, else null. */
function pagesUrl(basePath) {
  const match = originUrl().match(/github\.com[:/]([^/]+)\/[^/]+?(?:\.git)?$/);
  return match ? `https://${match[1].toLowerCase()}.github.io${basePath}/` : null;
}

/**
 * The built commit on origin's GitHub page when origin has it, else origin's repository page; null when
 * origin is not on GitHub (the app then keeps its default link).
 */
function sourceCodeUrl(fullCommit) {
  const match = originUrl().match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;
  const repository = `https://github.com/${match[1]}/${match[2]}`;
  try {
    git("fetch", "--quiet", "origin");
    const onOrigin = git("branch", "--remotes", "--contains", fullCommit).split("\n").some((ref) => ref.trim().startsWith("origin/"));
    return onOrigin ? `${repository}/tree/${fullCommit}` : repository;
  } catch {
    return repository;
  }
}

function remoteBranchExists(branch) {
  try {
    git("fetch", "--quiet", "origin", branch);
    git("rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Replaces the content of the local Pages branch with the build and commits it, starting from
 * origin/<branch> when it exists (an earlier unpushed deploy commit is replaced). With `squash` the
 * commit has no parent and becomes the branch's only commit. Works in its own worktree; returns the
 * new commit or null when the build is identical to what the branch has.
 */
async function commitToPagesBranch(branch, buildDir, message, squash) {
  const branchWorktree = join(temporary, "pages-branch");
  const remoteExists = remoteBranchExists(branch);
  if (squash) {
    git("worktree", "add", "--detach", branchWorktree);
  } else if (remoteExists) {
    git("worktree", "add", "-B", branch, branchWorktree, `origin/${branch}`);
  } else {
    git("worktree", "add", "--detach", branchWorktree);
    execFileSync("git", ["switch", "--orphan", branch], { cwd: branchWorktree, stdio: "ignore" });
  }
  try {
    const inBranch = (...args) => execFileSync("git", args, { cwd: branchWorktree, encoding: "utf8" }).trim();
    for (const entry of await readdir(branchWorktree)) {
      if (entry !== ".git") await rm(join(branchWorktree, entry), { recursive: true, force: true });
    }
    await cp(buildDir, branchWorktree, { recursive: true });
    inBranch("add", "--all");
    if (squash) {
      const tree = inBranch("write-tree");
      const remoteIsThisBuild = remoteExists
        && git("rev-parse", `origin/${branch}^{tree}`) === tree
        && git("rev-list", "--count", `origin/${branch}`) === "1";
      if (remoteIsThisBuild) return null;
      const deploy = inBranch("commit-tree", tree, "-m", message);
      git("branch", "--force", branch, deploy);
      return git("rev-parse", "--short", deploy);
    }
    if (!inBranch("status", "--porcelain")) return null;
    inBranch("commit", "--quiet", "-m", message);
    return inBranch("rev-parse", "--short", "HEAD");
  } finally {
    git("worktree", "remove", "--force", branchWorktree);
  }
}

function normalizeBasePath(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
}

async function folderSize(directory) {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    files += 1;
    bytes += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return { files, bytes };
}

const basePath = normalizeBasePath(options["base-path"] ?? `/${repositoryName()}`);
const outDir = resolve(options.out ?? join(repositoryRoot, "out", "github-pages"));
const commit = git("rev-parse", "--short", "HEAD");
const fullCommit = git("rev-parse", "HEAD");
const sourceBranch = git("rev-parse", "--abbrev-ref", "HEAD");

if (!existsSync(join(repositoryRoot, "node_modules"))) {
  console.error("[pages] node_modules is missing. Run `npm install` first.");
  process.exit(1);
}
if (git("status", "--porcelain", "--untracked-files=no")) {
  console.warn(`[pages] The working tree has uncommitted changes; building commit ${commit} without them.`);
}

const temporary = await mkdtemp(join(tmpdir(), "sketchforge-pages-"));
const worktree = join(temporary, "repository");
try {
  console.log(`[pages] Building ${commit} for base path "${basePath || "/"}"`);
  git("worktree", "add", "--detach", worktree, "HEAD");
  await symlink(join(repositoryRoot, "node_modules"), join(worktree, "node_modules"), "dir");
  await rm(join(worktree, "apps", "web", "src", "app", "api"), { recursive: true, force: true });

  const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_CODE_URL?.trim() || sourceCodeUrl(fullCommit);
  if (sourceUrl) {
    console.log(`[pages] "View source code" links to ${sourceUrl}`);
    if (!sourceUrl.includes(fullCommit) && !process.env.NEXT_PUBLIC_SOURCE_CODE_URL) {
      console.warn(`[pages] ${commit} is not on origin yet, so the link shows the repository. Push it first for a link to this exact source.`);
    }
  }
  const env = {
    ...process.env,
    STATIC_EXPORT: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_TELEMETRY_DISABLED: "1",
    ...(sourceUrl ? { NEXT_PUBLIC_SOURCE_CODE_URL: sourceUrl } : {}),
  };
  run(process.execPath, ["scripts/copy-occt-wasm.mjs"], worktree, env);
  run("npx", ["next", "build", "apps/web"], worktree, env);
  run(process.execPath, ["scripts/verify-static-worker-assets.mjs"], worktree, env);

  await rm(outDir, { recursive: true, force: true });
  await cp(join(worktree, "apps", "web", ".next-export"), outDir, { recursive: true });
  // GitHub Pages runs Jekyll by default, which drops the _next/ folder.
  await writeFile(join(outDir, ".nojekyll"), "");

  const { files, bytes } = await folderSize(outDir);
  console.log(`\n[pages] ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${outDir}`);

  const site = pagesUrl(basePath);
  if (options["no-commit"]) {
    console.log("[pages] Nothing was committed or published.");
  } else {
    const squash = options.squash;
    const deploy = await commitToPagesBranch(options.branch, outDir, `deploy: GitHub Pages build of ${sourceBranch} ${commit}`, squash);
    console.log(deploy
      ? `[pages] Committed ${deploy} to the local ${options.branch} branch${squash ? " as its only commit (no history)" : ""}. Nothing was pushed.`
      : `[pages] The local ${options.branch} branch already has this build. Nothing was pushed.`);
    // --force-with-lease: rewrites the remote branch only if it is still where the fetch above found it.
    console.log(`[pages] Publish with: git push ${squash ? "--force-with-lease " : ""}origin ${options.branch}`);
  }
  if (site) console.log(`[pages] Site: ${site}`);
} finally {
  try {
    git("worktree", "remove", "--force", worktree);
  } catch {
    // The worktree may not have been created.
  }
  await rm(temporary, { recursive: true, force: true });
}
