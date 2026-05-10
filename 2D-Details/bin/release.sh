#!/usr/bin/env bash
# Mirror dev/ → root after Dan has verified dev/index.html in a browser.
# Run from the project root (2D-Details/).

set -euo pipefail

if [ ! -f dev/index.html ]; then
  echo "ERROR: dev/index.html not found. Run from 2D-Details/." >&2
  exit 1
fi

if [ ! -d dev/css ] || [ ! -d dev/js ]; then
  echo "ERROR: dev/css and dev/js not found. Has dev/ been initialised?" >&2
  exit 1
fi

echo "Mirroring dev/ → root..."
cp dev/index.html index.html
rm -rf css/ js/
cp -R dev/css css
cp -R dev/js js
echo "Done."
echo
echo "Verify:"
echo "  open index.html        # quick check"
echo "  python3 -m http.server # if file:// has issues"
echo
echo "Then commit when satisfied:"
echo "  git status"
echo "  git add index.html css/ js/ CLAUDE.md README.md CHANGELOG.md archive/"
echo "  git commit"
