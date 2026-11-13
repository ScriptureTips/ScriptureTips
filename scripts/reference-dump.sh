#!/usr/bin/env bash
# Builds the reference data dump for production (infra/deploy/README.md, "The database"): a
# fresh database on the development PostgreSQL, migrated with this checkout's schema, loaded with
# the translations and the original-language data from ../source-texts, then dumped whole.
#
#   scripts/reference-dump.sh [output]        # default: reference-<git describe>.dump
#
# Check out the tag that production runs first: the dump's schema must match its migrations.
# The development database itself is never touched (it holds test accounts and compilations).
set -euo pipefail
cd "$(dirname "$0")/.."

DB=reference
URL="postgres://scripturetips:scripturetips@postgres:5432/$DB"
VERSION="$(git describe --tags --always --dirty)"
OUT="${1:-reference-$VERSION.dump}"

step() { printf '\n== %s\n' "$*"; }
psql_dev() { docker compose exec -T postgres psql -U scripturetips -v ON_ERROR_STOP=1 -Atq "$@"; }

[[ -d ../source-texts/imported ]] || {
  echo "../source-texts/imported is missing: run the scripture import first (tools/scripture-import/AGENTS.md)." >&2
  exit 1
}
case "$VERSION" in
  v*-g* | *-dirty | [0-9a-f]*) echo "Warning: $VERSION is not a clean release tag; the schema may not match production." >&2 ;;
esac

step "Starting the development PostgreSQL"
docker compose --profile dev up -d --wait postgres

step "Creating an empty database '$DB'"
psql_dev -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)"
psql_dev -d postgres -c "CREATE DATABASE $DB OWNER scripturetips"

# Every load runs against $URL; check the toolbox really passes it on before writing anything.
toolbox() { ./toolbox env DATABASE_URL="$URL" "$@"; }
[[ "$(toolbox printenv DATABASE_URL 2>/dev/null | tail -n 1)" == "$URL" ]] || {
  echo "The toolbox did not pass DATABASE_URL through; stopping before it loads into the development database." >&2
  exit 1
}

step "Migrating ($VERSION)"
toolbox pnpm --filter @scripturetips/db migrate

step "Loading the translations"
toolbox pnpm --filter @scripturetips/scripture-import run load /source-texts/imported

step "Loading the original-language data"
# Not `run load /source-texts`: that script is the bare CLI, which takes `load` or `align` first.
toolbox pnpm --filter @scripturetips/original-import exec node src/cli.ts load /source-texts

step "Aligning the translations"
toolbox pnpm --filter @scripturetips/original-import exec node src/cli.ts align

step "Checking the data"
read -r translations verses tokens < <(psql_dev -d "$DB" -F ' ' -c \
  "SELECT (SELECT count(*) FROM translation), (SELECT count(*) FROM verse_text), (SELECT count(*) FROM token)")
echo "translations: $translations, verses: $verses, original-language words: $tokens"
if (( translations == 0 || verses == 0 || tokens == 0 )); then
  echo "Something didn't load; no dump written." >&2
  exit 1
fi

step "Dumping to $OUT"
docker compose exec -T postgres pg_dump -Fc -U scripturetips "$DB" > "$OUT.tmp"
pg_entries="$(docker compose exec -T postgres pg_restore -l < "$OUT.tmp" | grep -c ' TABLE DATA ')"
(( pg_entries > 0 )) || { rm -f "$OUT.tmp"; echo "The dump has no table data." >&2; exit 1; }
mv "$OUT.tmp" "$OUT"

psql_dev -d postgres -c "DROP DATABASE $DB"
echo
echo "Done: $OUT ($(du -h "$OUT" | cut -f1), $pg_entries tables with data), schema $VERSION."
echo "Restore it on the server: roles/scripturetips-data/README.md in the Ansible repository."
