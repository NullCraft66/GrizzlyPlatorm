#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_PROJECT="$SCRIPT_DIR/../GrizzlyPlatform.Web/GrizzlyPlatform.Web.csproj"
ICON_SOURCE="$SCRIPT_DIR/../GrizzlyPlatform.Web/wwwroot/images/grizzly-app-icon.png"
OUTPUT_APP="${1:-$HOME/Applications/Grizzly Platform.app}"

if ! command -v dotnet >/dev/null 2>&1; then
    echo "The Mac app build requires the .NET 10 SDK and Xcode Command Line Tools." >&2
    echo "The finished .app bundles the .NET runtime, so Mac users do not need to install .NET." >&2
    exit 1
fi

if [[ ! -f "$WEB_PROJECT" || ! -f "$ICON_SOURCE" ]]; then
    echo "The existing web project or Grizzly app icon could not be found." >&2
    exit 1
fi

if [[ -e "$OUTPUT_APP" ]]; then
    echo "Refusing to overwrite the existing app bundle: $OUTPUT_APP" >&2
    echo "Choose a new output path or move the existing bundle first." >&2
    exit 1
fi

case "$(uname -m)" in
    arm64) RUNTIME_ID="osx-arm64" ;;
    x86_64) RUNTIME_ID="osx-x64" ;;
    *) echo "Unsupported Mac architecture: $(uname -m)" >&2; exit 1 ;;
esac

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/grizzly-platform-mac.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

APP_STAGE="$STAGE/Grizzly Platform.app"
CONTENTS="$APP_STAGE/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"
ICONSET="$STAGE/GrizzlyPlatform.iconset"
mkdir -p "$MACOS" "$RESOURCES/Web" "$ICONSET"

dotnet publish "$WEB_PROJECT" \
    --configuration Release \
    --runtime "$RUNTIME_ID" \
    --self-contained true \
    -p:UseAppHost=true \
    --output "$RESOURCES/Web"

swiftc -O -swift-version 5 -parse-as-library \
    -framework AppKit \
    -framework SwiftUI \
    -framework WebKit \
    "$SCRIPT_DIR/GrizzlyPlatformMac.swift" \
    -o "$MACOS/GrizzlyPlatformMac"

cp "$SCRIPT_DIR/Info.plist" "$CONTENTS/Info.plist"
chmod 755 "$MACOS/GrizzlyPlatformMac" "$RESOURCES/Web/GrizzlyPlatform.Web"

for entry in "16 16x16" "32 16x16@2x" "32 32x32" "64 32x32@2x" \
             "128 128x128" "256 128x128@2x" "256 256x256" \
             "512 256x256@2x" "512 512x512" "1024 512x512@2x"; do
    size="${entry%% *}"
    name="${entry#* }"
    sips -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/icon_$name.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RESOURCES/GrizzlyPlatform.icns"

codesign --force --deep --sign - "$APP_STAGE"
mkdir -p "$(dirname "$OUTPUT_APP")"
ditto "$APP_STAGE" "$OUTPUT_APP"
xattr -cr "$OUTPUT_APP"
codesign --force --deep --sign - "$OUTPUT_APP"
codesign --verify --deep --strict "$OUTPUT_APP"

echo "Created: $OUTPUT_APP"
echo "Backend: the existing API configured in API Settings (default http://10.20.118.4:5263/)."
