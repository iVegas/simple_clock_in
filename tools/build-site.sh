#!/bin/sh
# Assemble the deployable site into _site/ and stamp the app version
# (service-worker cache name + version shown in the app).
# Runs inside the dev container: `make site VERSION=abc1234`.
set -eu

VERSION="${1:?usage: build-site.sh <version>}"

rm -rf _site
mkdir _site
cp -R index.html manifest.webmanifest sw.js config.js assets src vendor _site/
sed -i "s/__APP_VERSION__/${VERSION}/g" _site/sw.js _site/src/version.js

echo "Built _site/ (version ${VERSION})"
