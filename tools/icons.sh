#!/bin/sh
# Render PNG app icons from SVG sources with rsvg-convert.
# Runs inside the dev container: `make icons`.
set -eu

OUT=assets/icons
ANY="$OUT/icon.svg"                 # rounded icon, also used as the favicon
MASKABLE=tools/icon-maskable.svg     # full-bleed, glyph inside the 80% safe zone

rsvg-convert -w 192 -h 192 "$ANY" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$ANY" -o "$OUT/icon-512.png"
rsvg-convert -w 512 -h 512 "$MASKABLE" -o "$OUT/maskable-512.png"
rsvg-convert -w 180 -h 180 "$MASKABLE" -o "$OUT/apple-touch-icon.png"

echo "Rendered icons into $OUT/"
