"""Serves PocketVibe game builds to a local Chrome with the HUD harness
injected, and appends what the page POSTs to /report to a log file.
Usage: python3 -I server.py <games-dir> <runtime-dir> <harness-dir> <log> [port]"""
import http.server
import os
import sys

games, runtime, harness, log = (os.path.abspath(a) for a in sys.argv[1:5])
port = int(sys.argv[5]) if len(sys.argv) > 5 else 8766
INJECT = (b'<script src="/runtime/css.js"></script><script src="/runtime/layout.js"></script>'
          b'<script src="/runtime/hud.js"></script>'
          b'<script src="/harness/harness.js"></script><script src="/harness/hudview.js"></script>')


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        for prefix, root in (('/runtime/', runtime), ('/harness/', harness)):
            if path.startswith(prefix):
                return os.path.join(root, path[len(prefix):])
        # /<game>/... -> games/<game>/dist/...
        parts = path.lstrip('/').split('/', 1)
        rest = parts[1] if len(parts) > 1 else ''
        return os.path.join(games, parts[0], 'dist', rest or 'index.html')

    def send_head(self):
        path = self.translate_path(self.path)
        if path.endswith('index.html') and os.path.isfile(path):
            body = open(path, 'rb').read().replace(b'</head>', INJECT + b'</head>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            import io
            return io.BytesIO(body)
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(log, 'ab') as f:
            f.write(body + b'\n')
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
