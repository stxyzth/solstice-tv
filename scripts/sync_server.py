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
import http.client
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
            qv = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get('v')
            if qv:
                try:
                    since = int(qv[0])
                except (TypeError, ValueError):
                    since = 0
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
        elif path.startswith('/webosbrew/'):
            root = os.path.abspath(os.path.join(APP_DIR, '..'))
            fp = os.path.abspath(os.path.join(root, path.lstrip('/')))
            if not fp.startswith(root) or not os.path.isfile(fp):
                return self._json({'error': 'not found'}, 404)
            body = open(fp, 'rb').read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def relay(self):
        """LAN relay for browser mode: desktop pages can't call providers
        cross-origin (no CORS headers on panels), so the sync server fetches
        on their behalf. HLS playlists are rewritten so every nested URI is
        fetched through the relay too; live TS streams are passed through in
        chunks (they never end). Trusted-home-network convenience only."""
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        target = (qs.get('url') or [''])[0]
        if not target.startswith('http'):
            return self._json({'error': 'bad url'}, 400)
        conn, resp, final_url = self._fetch_follow(target)
        if resp is None or final_url is None:
            return self._json({'error': 'unreachable'}, 502)
        low_t = final_url.split('?')[0].lower()
        ctype = (resp.getheader('Content-Type') or 'application/octet-stream').lower()
        low_final = final_url.split('?')[0].lower()

        playlist = low_final.endswith('.m3u8') or 'mpegurl' in ctype
        ts_like = low_final.endswith('.ts') or low_t.endswith('.mpegts') or 'mp2t' in ctype or ctype.startswith('video/')
        head = b''

        if not playlist and not ts_like:
            # sniff: MPEG-TS sync byte 0x47 every 188 bytes
            head = resp.read(564)
            if len(head) >= 189 and head[0] == 0x47 and head[188] == 0x47:
                ts_like = True
            else:
                rest = resp.read()
                resp.close(); conn.close()
                return self._serve_buffered(head + rest, ctype)

        if playlist:
            body = resp.read(64 * 1024 * 1024)
            resp.close(); conn.close()
            text = body.decode('utf-8', 'replace')
            out = []
            for line in text.splitlines():
                ls = line.strip()
                if ls and not ls.startswith('#'):
                    absu = urllib.parse.urljoin(final_url, ls)
                    out.append('/api/proxy?url=' + urllib.parse.quote(absu, safe=''))
                else:
                    out.append(line)
            body = ('\n'.join(out) + '\n').encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.apple.mpegurl')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            conn.close()
            return

        # live TS: stream pass-through (never ends)
        self.send_response(200)
        self.send_header('Content-Type', ctype if 'video' in ctype or 'mp2t' in ctype else 'video/mp2t')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        try:
            if head:
                self.wfile.write(head)
                self.wfile.flush()
            while True:
                chunk = resp.read(32768)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            try: resp.close()
            except Exception: pass
            try: conn.close()
            except Exception: pass

    def _serve_buffered(self, body, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _fetch_follow(self, target, max_hops=4):
        url = target
        resp = None
        for _ in range(max_hops):
            p = urllib.parse.urlparse(url)
            port = p.port or (443 if p.scheme == 'https' else 80)
            if p.scheme == 'https':
                conn = http.client.HTTPSConnection(p.hostname, port, timeout=30)
            else:
                conn = http.client.HTTPConnection(p.hostname, port, timeout=30)
            conn.request('GET', p.path + (('?' + p.query) if p.query else ''),
                         headers={'User-Agent': 'Mozilla/5.0'})
            resp = conn.getresponse()
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.getheader('Location')
                resp.read()
                conn.close()
                if not loc:
                    break
                url = urllib.parse.urljoin(url, loc)
                continue
            return conn, resp, url
        return conn, resp, url

    def stream_passthrough(self, target):
        conn, resp, url = self._fetch_follow(target)
        self.send_response(200)
        self.send_header('Content-Type', resp.getheader('Content-Type', 'video/mp2t'))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        try:
            while True:
                chunk = resp.read(32768)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        finally:
            try: conn.close()
            except Exception: pass

    def do_POST(self):
        if self.path.startswith('/api/state/'):
            try:
                length = int(self.headers.get('Content-Length') or 0)
                data = json.loads(self.rfile.read(length) or b'{}')
            except Exception:
                return self._json({'error': 'bad json'}, 400)
            with _lock:
                prev = _state.get(self._token(), {'v': 0})
                try:
                    given_v = int(data.get('v') or 0)
                except (TypeError, ValueError):
                    given_v = 0
                st = {
                    'v': max(given_v, prev.get('v', 0) + 1),
                    'settings': data.get('settings') if isinstance(data.get('settings'), dict) else {},
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
