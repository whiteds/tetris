#!/usr/bin/env bash
set -euo pipefail

# Configuration via env vars with sensible defaults
: "${TARGET_REPO:=git@github.com:whiteds/whiteds.github.io.git}"
: "${TARGET_BRANCH:=master}"
: "${BUILD_CMD:=npm run build}"
: "${DIST_DIR:=dist}"

# Prefer HTTPS with token when provided to avoid SSH setup
: "${GIT_USER:=x-access-token}"
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-${DEPLOY_TOKEN:-}}}"

# Accept new SSH host keys automatically if SSH is used
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o StrictHostKeyChecking=accept-new}"

# If a token is present, convert TARGET_REPO to an HTTPS URL with embedded token
if [[ -n "${TOKEN}" ]]; then
  if [[ "${TARGET_REPO}" =~ ^git@github.com:(.+)\.git$ ]]; then
    REPO_PATH="${BASH_REMATCH[1]}"
    TARGET_REPO="https://${GIT_USER}:${TOKEN}@github.com/${REPO_PATH}.git"
  elif [[ "${TARGET_REPO}" =~ ^https://github.com/(.+)\.git$ && ! "${TARGET_REPO}" =~ @ ]]; then
    REPO_PATH="${BASH_REMATCH[1]}"
    TARGET_REPO="https://${GIT_USER}:${TOKEN}@github.com/${REPO_PATH}.git"
  fi
fi

# Check prerequisites
if ! command -v git >/dev/null 2>&1; then
  echo "git not found" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found" >&2
  exit 1
fi
if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync not found" >&2
  exit 1
fi

# Ensure clean working tree (optional: warn only)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Warning: You have uncommitted changes; proceeding anyway." >&2
fi

# Build
$BUILD_CMD

if [ ! -d "$DIST_DIR" ]; then
  echo "Dist directory '$DIST_DIR' not found after build" >&2
  exit 1
fi

# Prepare temp worktree for deploy
TMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

printf "Cloning %s (branch %s) ...\n" "$TARGET_REPO" "$TARGET_BRANCH"
git clone --depth 1 --branch "$TARGET_BRANCH" "$TARGET_REPO" "$TMP_DIR" 2>/dev/null || {
  echo "Branch $TARGET_BRANCH not found; cloning default branch and creating it" >&2
  git clone --depth 1 "$TARGET_REPO" "$TMP_DIR"
  (cd "$TMP_DIR" && git checkout -b "$TARGET_BRANCH")
}

# Sync dist contents to repo root (preserve .git only)
rsync -av --delete --exclude '.git' "$DIST_DIR"/ "$TMP_DIR"/

# Commit and push if there are changes
cd "$TMP_DIR"
# Ensure local git identity for commit (no global changes)
git config user.name "${GIT_AUTHOR_NAME:-whiteds-deployer}"
git config user.email "${GIT_AUTHOR_EMAIL:-actions@users.noreply.github.com}"
if git status --porcelain | grep -q .; then
  git add -A
  COMMIT_MSG="deploy: update from tetris $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  git commit -m "$COMMIT_MSG"
  git push origin "$TARGET_BRANCH"
  echo "Deployed to $TARGET_REPO ($TARGET_BRANCH)"
else
  echo "No changes to deploy"
fi
