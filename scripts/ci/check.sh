#!/usr/bin/env bash
# The checks CI runs (.woodpecker/check.yaml): everything `pnpm verify:full` does, in a plain
# Node image with only what the tests need added. Meant for a fresh container, as root, with the
# test database and file store reachable (compose.yaml: postgres-test, garage-test). The versions
# match the toolbox image (infra/docker/toolbox).
set -euo pipefail
cd "$(dirname "$0")/../.."

PNPM_VERSION=12.15.0

# Typst, poppler and the fonts, exactly as the toolbox has them.
infra/docker/toolbox/install-pdf-tools.sh
export FONT_PATH=/fonts

# Native modules with no prebuilt binary for this Node version (tree-sitter, for usfm-grammar).
apt-get update -qq
apt-get install -y -qq --no-install-recommends python3 make g++ ca-certificates
export CXXFLAGS=-std=c++20

npm install -g "pnpm@${PNPM_VERSION}"
pnpm install --frozen-lockfile

node scripts/ci/wait-for.mjs tcp://postgres-test:5432 http://garage-test:3903/health

pnpm verify:full
