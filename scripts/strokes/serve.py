#!/usr/bin/env python3
"""The stroke archive over HTTP, with comments (#536).

  serve.py [port]   (default 8765, on every interface: the tablet is on the wifi)

Serves docs/reference/strokes as files, plus

  GET  /comments        -> the comments, JSON list
  POST /comments        {sheet, n, version, text} -> appended, with time

Comments live in docs/reference/strokes/comments.json, in the repo, where
Claude reads them: a comment is on one stroke of one sheet and on the engine
version it was written about (the Grafetto pane's version at the time).
"""
import datetime
import http.server
import json
import os
import sys
import threading
import uuid

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'docs', 'reference', 'strokes'))
FILE = os.path.join(ROOT, 'comments.json')
LOCK = threading.Lock()


def load():
    try:
        with open(FILE, encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        # Fresh data on every load: the archive is rebuilt under a running server.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def _json(self, code, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split('?')[0] == '/comments':
            return self._json(200, load())
        return super().do_GET()

    def do_POST(self):
        if self.path != '/comments':
            return self._json(404, {'error': 'not found'})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
            text = str(body.get('text', '')).strip()
            if not text:
                return self._json(400, {'error': 'empty'})
            c = {'id': uuid.uuid4().hex[:10], 'sheet': str(body.get('sheet', '')), 'n': body.get('n'),
                 'version': body.get('version'), 'text': text[:4000],
                 'at': datetime.datetime.now().isoformat(timespec='seconds')}
        except (ValueError, TypeError):
            return self._json(400, {'error': 'bad json'})
        with LOCK:
            cs = load()
            cs.append(c)
            tmp = FILE + '.tmp'
            with open(tmp, 'w', encoding='utf-8') as f:
                json.dump(cs, f, ensure_ascii=False, indent=1)
                f.write('\n')
            os.replace(tmp, FILE)
        return self._json(200, c)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler).serve_forever()
