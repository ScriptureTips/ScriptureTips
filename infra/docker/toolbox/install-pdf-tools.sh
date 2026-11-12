#!/usr/bin/env bash
# Installs what the PDF tests need into a Debian-based image, as root: Typst, poppler-utils and
# the fonts (in /fonts: set FONT_PATH=/fonts). Used by the toolbox image and by CI
# (scripts/ci/check.sh), so the versions are pinned in this one place.
set -euo pipefail

TYPST_VERSION=0.15.1
TYPST_SHA256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c

apt-get update -qq
apt-get install -y -qq --no-install-recommends ca-certificates curl xz-utils unzip poppler-utils
rm -rf /var/lib/apt/lists/*

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl -fsSL -o "$work/typst.tar.xz" \
  "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz"
echo "${TYPST_SHA256}  $work/typst.tar.xz" | sha256sum -c -
tar -xJf "$work/typst.tar.xz" -C "$work"
install -m 0755 "$work/typst-x86_64-unknown-linux-musl/typst" /usr/local/bin/typst

mkdir -p /fonts
curl -fsSL -o "$work/gentium.zip" \
  https://github.com/silnrsi/font-gentium/releases/download/v7.000/Gentium-7.000.zip
echo "313e64963ba27851356060a725d36ce01680e5c5c63f46e4b40f15741c043e21  $work/gentium.zip" | sha256sum -c -
curl -fsSL -o "$work/ezra.zip" https://software.sil.org/downloads/r/ezra/EzraSIL-2.51.zip
echo "f16bcb3ec4473ac6a9f138ee0dbde7cc2f835e93a90cbe8649b3f32677760cc1  $work/ezra.zip" | sha256sum -c -
unzip -j -q "$work/gentium.zip" "*.ttf" -d /fonts
unzip -j -q "$work/ezra.zip" "*.ttf" -d /fonts
chmod -R a+rX /fonts
