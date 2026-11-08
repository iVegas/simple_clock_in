#!/bin/sh
# Vendor the Vue ESM browser build (full build: includes the runtime template compiler).
# Runs inside the dev container: `make vendor [VUE_VERSION=3.5]`.
set -eu

RANGE="${1:-3.5}"
DEST="$(pwd)/vendor"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cd "$TMP"
TARBALL="$(npm pack "vue@${RANGE}" --silent)"
tar -xzf "$TARBALL"
VERSION="$(node -p "require('./package/package.json').version")"

mkdir -p "$DEST"
cp package/dist/vue.esm-browser.prod.js "$DEST/vue.esm-browser.prod.js"
cp package/LICENSE "$DEST/vue.LICENSE"
echo "$VERSION" > "$DEST/vue.VERSION"

echo "Vendored vue@${VERSION} into vendor/"
