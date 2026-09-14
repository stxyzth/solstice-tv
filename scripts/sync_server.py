#!/usr/bin/env python3
"""Solstice TV LAN host: static app server + settings relay for the mobile companion page.

- Serves the app/ directory over the LAN (so an iPhone on the same WiFi can open it).
- Tiny JSON relay: the TV seeds /api/state/<pair>, the phone posts new settings,
  the TV long-polls /api/wait/<pair> to pick them up live.

Stdlib only. Run:  python3 scripts/sync_server.py   (env PORT=8642)
"""
import json
import os
import socket
import threading
import time
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'app'))
PORT = int(os.environ.get('PORT', '8642'))

_lock = threading.Lock()
_state = {}  # pair -> {'v': int, 'settings': dict}


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return '127.0.0.1'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=APP_DIR, **kw)

    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _token(self):
        parts = self.path.split('?')[0].rstrip('/').split('/')
        return parts[3] if len(parts) > 3 else 'default'

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/api/proxy':
            return self.relay()

        path = self.path.split('?')[0]
        if path == '/api/host':
            self._json({'ip': lan_ip(), 'port': PORT})
        elif path.startswith('/api/state/'):
            with _lock:
                st = _state.get(self._token(), {'v': 0, 'settings': {}})
            self._json(st)
        elif path.startswith('/api/wait/'):
            token = self._token()
            since = 0
            if '?v=' in self.path:
                try:
                    since = int(self.path.split('?v=')[1])
                except Exception:
                    pass
            deadline = time.time() + 25
            while time.time() < deadline:
                with _lock:
                    st = _state.get(token)
                    if st and st['v'] > since:
                        self._json(st)
                        return
                time.sleep(0.35)
            # long-poll timeout: empty success so clients just re-poll
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        else:
            super().do_GET()

    def relay(self):
        """LAN relay for browser mode: desktop pages can't call providers
        cross-origin (no CORS headers on panels), so the sync server fetches
        on their behalf. Trusted-home-network convenience only."""
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        target = (qs.get('url') or [''])[0]
        if not target.startswith('http'):
            return self._json({'error': 'bad url'}, 400)
        try:
            req = urllib.request.Request(target, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                ctype = r.headers.get('Content-Type', 'application/octet-stream')
        except Exception as e:
            return self._json({'error': str(e)}, 502)
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.startswith('/api/state/'):
            try:
                length = int(self.headers.get('Content-Length') or 0)
                data = json.loads(self.rfile.read(length) or b'{}')
            except Exception:
                return self._json({'error': 'bad json'}, 400)
            with _lock:
                prev = _state.get(self._token(), {'v': 0})
                st = {
                    'v': max(int(data.get('v') or 0), prev.get('v', 0) + 1),
                    'settings': data.get('settings') or {},
                }
                _state[self._token()] = st
            self._json(st)
        else:
            self._json({'error': 'not found'}, 404)


def main():
    os.chdir(APP_DIR)
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print('Solstice TV sync server')
    print('  LAN URL for phone:  http://%s:%d/' % (lan_ip(), PORT))
    print('  Serving:            %s' % APP_DIR)
    srv.serve_forever()


if __name__ == '__main__':
    main()
