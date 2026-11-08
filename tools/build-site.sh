#!/bin/sh
# Assemble the deployable site into _site/ and stamp the app version
# (service-worker cache name + version shown in the app).
# Runs inside the dev container: `make site VERSION=abc1234`.
#
# When GOOGLE_CLIENT_ID / GOOGLE_API_KEY / GOOGLE_APP_ID are set (the Pages workflow passes
# the repository variables), _site/config.js is generated from them instead of copied.
set -eu

BASE_VERSION="${1:?usage: build-site.sh <version>}"

rm -rf _site
mkdir _site
cp -R index.html manifest.webmanifest sw.js config.js assets src vendor _site/

if [ -n "${GOOGLE_CLIENT_ID:-}${GOOGLE_API_KEY:-}${GOOGLE_APP_ID:-}" ]; then
  if [ -z "${GOOGLE_CLIENT_ID:-}" ] || [ -z "${GOOGLE_API_KEY:-}" ] || [ -z "${GOOGLE_APP_ID:-}" ]; then
    echo "warning: only some of GOOGLE_CLIENT_ID, GOOGLE_API_KEY, GOOGLE_APP_ID are set; the app will show its setup assistant" >&2
  fi
  # JSON.stringify keeps the generated JavaScript valid whatever the values contain.
  node -e '
    const config = {
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
      googleApiKey: process.env.GOOGLE_API_KEY || "",
      googleAppId: process.env.GOOGLE_APP_ID || "",
    };
    require("node:fs").writeFileSync("_site/config.js",
      "// Generated at deploy time from the GOOGLE_* repository variables.\n" +
      "window.CLOCKIN_CONFIG = " + JSON.stringify(config, null, 2) + ";\n");
  '
  echo "Generated _site/config.js from environment variables"
fi

# The config is part of the version: changing only the variables and redeploying the same
# commit still changes sw.js, so installed apps pick up the new config.
CONFIG_HASH="$(sha256sum _site/config.js | cut -c1-6)"
VERSION="${BASE_VERSION}-${CONFIG_HASH}"
sed -i "s/__APP_VERSION__/${VERSION}/g" _site/sw.js _site/src/version.js

echo "Built _site/ (version ${VERSION})"
