#!/usr/bin/env bash
# Assemble Pi.app: PiWorkbench + pi-web build + embedded Node + production node_modules.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-Pi}"
OUT_DIR="${OUT_DIR:-$ROOT/dist/macos}"
PI_WEB_BUILD="${PI_WEB_BUILD:-$ROOT}"
SWIFT_BUILD="${SWIFT_BUILD:-$ROOT/macos/PiWorkbench/.build/release/PiWorkbench}"
NODE_VERSION="${NODE_VERSION:-22.16.0}"
SKIP_NODE_EMBED="${SKIP_NODE_EMBED:-0}"

if [[ ! -f "$PI_WEB_BUILD/bin/pi-web.js" ]]; then
  echo "error: missing $PI_WEB_BUILD/bin/pi-web.js (run npm run build first)" >&2
  exit 1
fi

if [[ ! -f "$PI_WEB_BUILD/.next/BUILD_ID" ]]; then
  echo "error: missing $PI_WEB_BUILD/.next/BUILD_ID — run 'npm run build' before packaging" >&2
  exit 1
fi

if [[ ! -f "$PI_WEB_BUILD/package-lock.json" ]]; then
  echo "error: missing package-lock.json (required for production deps in the bundle)" >&2
  exit 1
fi

if [[ ! -x "$SWIFT_BUILD" ]]; then
  echo "building PiWorkbench release binary..."
  (cd "$ROOT/macos/PiWorkbench" && swift build -c release)
fi

APP_VERSION="$(node -e "console.log(require('$PI_WEB_BUILD/package.json').version)")"

APP="$OUT_DIR/$APP_NAME.app"
CONTENTS="$APP/Contents"
RES="$CONTENTS/Resources"
MACOS="$CONTENTS/MacOS"
NODE_DIR="$RES/node"
PI_WEB_RES="$RES/pi-web"

rm -rf "$APP"
mkdir -p "$MACOS" "$PI_WEB_RES" "$NODE_DIR/bin"

cp "$SWIFT_BUILD" "$MACOS/$APP_NAME"
chmod +x "$MACOS/$APP_NAME"

echo "copying pi-web build artifacts..."
rsync -a \
  --exclude node_modules \
  --exclude .git \
  "$PI_WEB_BUILD/bin" \
  "$PI_WEB_BUILD/.next" \
  "$PI_WEB_BUILD/public" \
  "$PI_WEB_BUILD/package.json" \
  "$PI_WEB_BUILD/package-lock.json" \
  "$PI_WEB_BUILD/next.config.ts" \
  "$PI_WEB_RES/"

embed_node() {
  if [[ "$SKIP_NODE_EMBED" == "1" ]]; then
    echo "SKIP_NODE_EMBED=1 — bundle will use PATH/homebrew node at runtime"
    return 0
  fi
  local arch os_id tarball cache_dir extract_dir node_bin
  arch="$(uname -m)"
  case "$arch" in
    arm64) os_id="darwin-arm64" ;;
    x86_64) os_id="darwin-x64" ;;
    *)
      echo "error: unsupported arch $arch for embedded Node" >&2
      exit 1
      ;;
  esac
  tarball="node-v${NODE_VERSION}-${os_id}.tar.gz"
  cache_dir="$OUT_DIR/.cache/node-v${NODE_VERSION}"
  extract_dir="$cache_dir/${tarball%.tar.gz}"
  node_bin="$NODE_DIR/bin/node"

  if [[ ! -x "$extract_dir/bin/node" ]]; then
    mkdir -p "$cache_dir"
    url="https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"
    echo "downloading Node ${NODE_VERSION} (${os_id})..."
    curl -fsSL "$url" -o "$cache_dir/$tarball"
    rm -rf "$extract_dir"
    tar -xzf "$cache_dir/$tarball" -C "$cache_dir"
  fi

  cp "$extract_dir/bin/node" "$node_bin"
  chmod +x "$node_bin"
  echo "embedded Node at $node_bin ($("$node_bin" -v))"
}

install_pi_web_deps() {
  if [[ -d "$PI_WEB_BUILD/node_modules/next" ]]; then
    echo "copying node_modules from $PI_WEB_BUILD..."
    rsync -a \
      --exclude .cache \
      "$PI_WEB_BUILD/node_modules" \
      "$PI_WEB_RES/"
    return 0
  fi
  echo "node_modules missing at repo root; running npm ci --omit=dev in bundle..."
  (cd "$PI_WEB_RES" && npm ci --omit=dev --ignore-scripts)
}

embed_node
install_pi_web_deps

if [[ ! -d "$PI_WEB_RES/node_modules/next" ]]; then
  echo "error: next not found under $PI_WEB_RES/node_modules" >&2
  exit 1
fi

cat > "$CONTENTS/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$APP_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>works.earendil.pi</string>
  <key>CFBundleName</key>
  <string>$APP_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$APP_VERSION</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

# Ad-hoc sign so Gatekeeper is less painful for local installs (not notarized).
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep -s - "$APP" 2>/dev/null || true
fi

echo ""
echo "assembled $APP"
echo "install: cp -R \"$APP\" /Applications/   # or drag into Applications"
echo "first launch (unsigned): xattr -cr \"$APP\"  # if macOS blocks the app"
echo "open: open \"$APP\""
