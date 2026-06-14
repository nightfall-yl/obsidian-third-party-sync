#!/bin/bash
# Usage: ./scripts/version.sh 26.0.1
# Syncs version across manifest.json, package.json, and package-lock.json

set -e

VERSION=${1:?Usage: $0 <version>}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Update manifest.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/manifest.json"
echo "manifest.json → $VERSION"

# Update package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$ROOT/package.json"
echo "package.json → $VERSION"

# Update package-lock.json (top-level + packages."")
python3 -c "
import json, sys
with open('$ROOT/package-lock.json') as f:
    p = json.load(f)
p['version'] = '$VERSION'
p['packages'][''] = p['packages'].get('', {})
p['packages']['']['version'] = '$VERSION'
with open('$ROOT/package-lock.json', 'w') as f:
    json.dump(p, f, indent=2)
    f.write('\n')
"
echo "package-lock.json → $VERSION"

echo "Done. All three files synced to version $VERSION"
