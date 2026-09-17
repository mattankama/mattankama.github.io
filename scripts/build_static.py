#!/usr/bin/env python3
"""Build the deployable copy of Rattlesnake into `dist/`.

Rattlesnake has no backend. The templates render no data — every row the lifter
sees is produced on the phone by app/static/js/local-api.js — so "deploying" is
just writing the four pages out as files and copying the static folder next to
them. The result works on any host that can serve a directory: GitHub Pages,
Cloudflare Pages, Netlify, an S3 bucket, a USB stick.

    python3 scripts/build_static.py

URLs are preserved exactly as the dev server serves them, `/routine/?id=12` and
all, so a link that works locally works deployed.
"""

import hashlib
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

# Each route and the file a static host will serve it from. The directory form
# (`progress/index.html` rather than `progress.html`) is what keeps the deployed
# URLs identical to the dev ones on every host, with no redirect rules to write.
PAGES = {
    "/": "index.html",
    "/progress": "progress/index.html",
    "/routine/": "routine/index.html",
    "/session/": "session/index.html",
}


def build_token(paths):
    """A short hash of everything shipped, used to name the offline cache.

    The service worker keeps one cache per token, so a changed byte anywhere
    produces a new name and the old cache is dropped on activate. Without this
    an installed app would keep serving the version it was installed with.
    """
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:12]


def build(dist=DIST):
    """Write the deployable site to `dist`, replacing whatever was there."""
    app = create_app()

    DIST_ = dist
    if DIST_.exists():
        shutil.rmtree(DIST_)
    DIST_.mkdir(parents=True)

    # 1. The static folder. The worker moves to the root, where its scope can
    #    cover every page rather than just /static/.
    shutil.copytree(ROOT / "app" / "static", DIST_ / "static")
    shutil.move(str(DIST_ / "static" / "sw.js"), str(DIST_ / "sw.js"))

    # 2. The pages, rendered by the same Flask app that serves them in dev.
    with app.test_client() as client:
        for url, target in PAGES.items():
            response = client.get(url)
            if response.status_code != 200:
                raise SystemExit(f"{url} returned {response.status_code}, expected 200")
            out = DIST_ / target
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(response.data)

    # 3. Stamp the worker with a token covering the whole tree — itself included,
    #    which is why it was copied in step 1 rather than written here. A fix to
    #    the worker alone still has to invalidate an installed app's cache, and a
    #    token computed before the worker existed could never do that.
    shipped = [p for p in DIST_.rglob("*") if p.is_file()]
    worker = DIST_ / "sw.js"
    worker.write_text(worker.read_text().replace("__BUILD__", build_token(shipped)))

    # 4. A host that reads it will skip Jekyll, which would eat nothing here
    #    today but silently drops any future file or folder beginning with "_".
    (DIST_ / ".nojekyll").touch()

    return DIST_


def main():
    dist = build()
    files = [p for p in dist.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    print(f"Built {dist}")
    print(f"  {len(files)} files, {total / 1024:.0f} KB")
    print("  Serve it locally with: python3 -m http.server -d dist 8000")


if __name__ == "__main__":
    main()
