#!/bin/bash
set -euo pipefail

[ -t 0 ] || cat >/dev/null 2>&1 || true

if [ "$(uname -s)" != "Linux" ]; then
  echo '{}'
  exit 0
fi

exec 3>&1 >/dev/null
cd "$(dirname "$0")/../.."
exec 9>/tmp/cloudflare-toolchain.lock
flock 9

tmp_node=""
tmp_skills=""
cleanup() {
  [ -z "$tmp_node" ] || rm -rf "$tmp_node"
  [ -z "$tmp_skills" ] || rm -rf "$tmp_skills"
}
trap cleanup EXIT

if [ -f .nvmrc ]; then
  node_major=$(grep -oE '[0-9]+' .nvmrc | head -n 1)
else
  node_major=$(curl -fsSL https://nodejs.org/dist/latest/SHASUMS256.txt | grep -oP 'node-v\K[0-9]+' | head -n 1)
fi

node_home=$HOME/.local/node$node_major
npm_version=""
if [ -f package.json ]; then
  npm_version=$(grep -oP '"packageManager"\s*:\s*"npm@\K[^"+]+' package.json || true)
fi

if [ "$(uname -m)" = "aarch64" ] || [ "$(uname -m)" = "arm64" ]; then
  node_arch=linux-arm64
else
  node_arch=linux-x64
fi

export NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

if [ ! -x "$node_home/bin/node" ]; then
  tarball=$(curl -fsSL "https://nodejs.org/dist/latest-v$node_major.x/SHASUMS256.txt" | awk "/-$node_arch\\.tar\\.gz$/ {print \$2; exit}")
  mkdir -p "$HOME/.local"
  tmp_node=$(mktemp -d "$HOME/.local/node$node_major.XXXXXX")
  curl -fsSL "https://nodejs.org/dist/latest-v$node_major.x/$tarball" | tar -xz -C "$tmp_node" --strip-components=1
  rm -rf "$node_home"
  mv "$tmp_node" "$node_home"
  tmp_node=""
fi

if [ "${PATH%%:*}" != "$node_home/bin" ]; then
  export PATH="$node_home/bin:$PATH"
fi

if [ -n "$npm_version" ] && [ "$("$node_home/bin/npm" -v 2>/dev/null || true)" != "$npm_version" ]; then
  (cd "$HOME" && "$node_home/bin/npm" install -g --prefix="$node_home" --loglevel=error "npm@$npm_version")
fi

if [ -f package-lock.json ] && { [ ! -d node_modules ] || [ node_modules -ot package-lock.json ]; }; then
  npm ci --loglevel=error || { rm -rf node_modules; exit 1; }
  touch node_modules
fi

skills_dir=$HOME/.gemini/config/skills
if [ ! -f "$skills_dir/cloudflare/SKILL.md" ] || [ ! -f "$skills_dir/wrangler/SKILL.md" ]; then
  mkdir -p "$skills_dir"
  tmp_skills=$(mktemp -d)
  curl -fsSL https://github.com/cloudflare/skills/archive/refs/heads/main.tar.gz | tar -xz -C "$tmp_skills" --strip-components=1
  for skill_path in "$tmp_skills"/skills/*; do
    [ -d "$skill_path" ] || continue
    skill_name=$(basename "$skill_path")
    if [ ! -d "$skills_dir/$skill_name" ]; then
      cp -R "$skill_path" "$skills_dir/$skill_name"
    fi
  done
  rm -rf "$tmp_skills"
  tmp_skills=""
fi

export CLOUDFLARE_ACCOUNT_ID=3a92b96171fb2f9bb3e834eb6dba73de
msg="export CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID PATH=$PATH"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f /home/antigravity/upload/cloudflare.env ]; then
  msg="$msg && set -a && source /home/antigravity/upload/cloudflare.env && set +a"
fi
msg=${msg//\\/\\\\}
msg=${msg//\"/\\\"}
printf '{"injectSteps":[{"systemMessage":{"systemMessage":"%s"}}]}\n' "$msg" >&3
