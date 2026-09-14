#!/usr/bin/env python3
"""Regenerate the webOS Homebrew Channel repository feed for Solstice TV.

Reads app/appinfo.json + dist/*.ipk and writes:
  webosbrew/solstice-tv.manifest.json
  webosbrew/repo.json

Run after every release:  ares-package app -o dist && python3 scripts/update_repo.py
"""
import glob
import hashlib
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BASE = 'https://raw.githubusercontent.com/stxyzth/solstice-tv/main'


def main():
    appinfo = json.load(open(os.path.join(ROOT, 'app', 'appinfo.json')))
    ipks = glob.glob(os.path.join(ROOT, 'dist', '*.ipk'))
    if not ipks:
        raise SystemExit('No ipk found in dist/ — run: ares-package app -o dist')
    ipk = ipks[0]

    data = open(ipk, 'rb').read()
    sha256 = hashlib.sha256(data).hexdigest()

    manifest = {
        'id': appinfo['id'],
        'version': appinfo['version'],
        'type': 'web',
        'title': appinfo['title'],
        'appDescription': 'Apple TV-style IPTV player for LG webOS: Live TV with EPG guide and catch-up, VOD, series, Multi-View, mobile edit.',
        'iconUri': BASE + '/app/assets/icon.png',
        'sourceUrl': 'https://github.com/stxyzth/solstice-tv',
        'rootRequired': False,
        'ipkUrl': BASE + '/dist/' + os.path.basename(ipk),
        'ipkHash': {'sha256': sha256},
        'ipkSize': len(data),
    }

    feed = {
        'paging': {'page': 1, 'count': 1, 'maxPage': 1, 'itemsTotal': 1, 'prevUrl': None, 'nextUrl': None},
        'packages': [{
            'id': manifest['id'],
            'title': manifest['title'],
            'iconUri': manifest['iconUri'],
            'manifestUrl': BASE + '/webosbrew/solstice-tv.manifest.json',
            'manifest': manifest,
            'pool': 'main',
            'shortDescription': manifest['appDescription'],
        }],
    }

    out1 = os.path.join(ROOT, 'webosbrew', 'solstice-tv.manifest.json')
    out2 = os.path.join(ROOT, 'webosbrew', 'repo.json')
    os.makedirs(os.path.dirname(out1), exist_ok=True)
    json.dump(manifest, open(out1, 'w'), indent=2)
    json.dump(feed, open(out2, 'w'), indent=2)
    print('manifest:', out1)
    print('feed:     ', out2)
    print('ipk sha256:', sha256)
    print('Feed URL to add in Homebrew Channel:')
    print('  ' + BASE + '/webosbrew/repo.json')


if __name__ == '__main__':
    main()
