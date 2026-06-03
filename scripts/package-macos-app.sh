#!/usr/bin/env bash
# Assemble Pi.app from a release pi-web build + PiWorkbench binary.
# Does NOT embed Node yet — see macos/README.md "Embedded Node strategy".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="${APP_NAME:-Pi}"
OUT_DIR="${OUT_DIR:-$ROOT/dist/macos}"
PI_WEB_BUILD="${PI_WEB_BUILD:-$ROOT}"
SWIFT_BUILD="${SWIFT_BUILD:-$ROOT/macos/PiWorkbench/.build/release/PiWorkbench}"

if [[ ! -f "$PI_WEB_BUILD/bin/pi-web.js" ]]; then
  echo "error: missing $PI_WEB_BUILD/bin/pi-web.js (run npm run build first)" >&2
  exit 1
fi

if [[ ! -f "$PI_WEB_BUILD/.next/BUILD_ID" ]]; then
  echo "error: missing $PI_WEB_BUILD/.next/BUILD_ID — run 'npm run build' before packaging" >&2
  exit 1
fi

if [[ ! -x "$SWIFT_BUILD" ]]; then
  echo "building PiWorkbench release binary..."
  (cd "$ROOT/macos/PiWorkbench" && swift build -c release)
fi

APP="$OUT_DIR/$APP_NAME.app"
CONTENTS="$APP/Contents"
RES="$CONTENTS/Resources"
MACOS="$CONTENTS/MacOS"

rm -rf "$APP"
mkdir -p "$MACOS" "$RES/pi-web"

cp "$SWIFT_BUILD" "$MACOS/$APP_NAME"
chmod +x "$MACOS/$APP_NAME"

rsync -a \
  --exclude node_modules \
  --exclude .git \
  "$PI_WEB_BUILD/bin" \
  "$PI_WEB_BUILD/.next" \
  "$PI_WEB_BUILD/public" \
  "$PI_WEB_BUILD/package.json" \
  "$PI_WEB_BUILD/next.config.ts" \
  "$RES/pi-web/"

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
  <string>0.6.12</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

mkdir -p "$RES/node"
cat > "$RES/node/README.txt" <<'EOF'
TODO (M1-A): embed a pinned Node binary for macOS arm64/x64 here, e.g.
  Contents/Resources/node/bin/node

PiWorkbench should set:
  NODE="$CONTENTS/Resources/node/bin/node"
  PI_WEB_ROOT="$CONTENTS/Resources/pi-web"

Until embedded Node ships, the dev shell uses PATH/homebrew node (see macos/README.md).
EOF

echo "assembled $APP"
echo "next: codesign + notarize; embed Node per $RES/node/README.txt"
