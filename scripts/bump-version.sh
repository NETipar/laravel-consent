#!/usr/bin/env bash
#
# Bump every npm package in the monorepo to the same version.
#
# Usage:
#   scripts/bump-version.sh 0.21.0
#
# Composer (Packagist) reads the version from the git tag, so there's
# nothing to bump in composer.json — only the three npm package.json
# files need to be kept in sync. The npm-publish workflow runs a
# version-sync verification step against the release tag and refuses
# to publish if the three versions disagree, so this script is the
# canonical way to bump them in lockstep.

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 <version>" >&2
    echo "Example: $0 0.21.0" >&2
    exit 1
fi

VERSION="$1"

# Validate the version is semver-shaped. Allows 1.2.3 and 1.2.3-rc.1.
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]]; then
    echo "error: '$VERSION' does not look like a semver version." >&2
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PACKAGES=(
    "$ROOT/packages/core/package.json"
    "$ROOT/packages/alpine/package.json"
    "$ROOT/packages/vue3/package.json"
)

for pkg in "${PACKAGES[@]}"; do
    if [[ ! -f "$pkg" ]]; then
        echo "error: $pkg not found." >&2
        exit 1
    fi

    # Use Node so the JSON formatting matches whatever pnpm/prettier
    # would write. sed-style edits leak whitespace differences.
    node -e "
        const fs = require('fs');
        const path = '$pkg';
        const p = JSON.parse(fs.readFileSync(path, 'utf8'));
        p.version = '$VERSION';
        fs.writeFileSync(path, JSON.stringify(p, null, 4) + '\n');
    "

    echo "  bumped $(basename "$(dirname "$pkg")") → $VERSION"
done

echo
echo "All three npm packages bumped to $VERSION."
echo "Next: update CHANGELOG.md, commit, and run \`gh release create v$VERSION\`."
