"""Graphic Design Tips — local server.

Serves the lesson viewer frontend and exposes lessons.json + gif_manifest.json
as a single API payload.

Run:  python server.py          (then open http://127.0.0.1:8931)
      python server.py --window (native desktop window via pywebview)
"""

import json
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

APP_DIR = Path(__file__).resolve().parent
STATIC = APP_DIR / "static"
PORT = 8931


def load_lessons():
    lessons = json.loads((APP_DIR / "lessons.json").read_text(encoding="utf-8"))
    manifest_path = APP_DIR / "gif_manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    for lesson in lessons:
        gifs = manifest.get(lesson["id"], {})
        idx = 0
        for section in lesson["sections"]:
            section["bullet_gifs"] = []
            for _ in section["bullets"]:
                section["bullet_gifs"].append(gifs.get(str(idx)))
                idx += 1
    return lessons


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _send(self, status: int, body: bytes, ctype: str):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/lessons":
            body = json.dumps(load_lessons()).encode("utf-8")
            self._send(200, body, "application/json; charset=utf-8")
            return
        name = url.path.lstrip("/") or "index.html"
        f = (STATIC / name).resolve()
        if STATIC not in f.parents or not f.is_file():
            self._send(404, b"not found", "text/plain")
            return
        ctypes = {".html": "text/html; charset=utf-8",
                  ".css": "text/css; charset=utf-8",
                  ".js": "text/javascript; charset=utf-8",
                  ".svg": "image/svg+xml",
                  ".png": "image/png",
                  ".gif": "image/gif",
                  ".ico": "image/x-icon"}
        self._send(200, f.read_bytes(),
                   ctypes.get(f.suffix.lower(), "application/octet-stream"))


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"

    if "--window" in sys.argv:
        import ctypes
        if sys.platform == "win32":
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "GraphicDesignTips.App")
        import webview
        threading.Thread(target=server.serve_forever, daemon=True).start()
        webview.create_window("Graphic Design Tips", url,
                               width=1440, height=900,
                               min_size=(900, 600))
        webview.start(icon=str(APP_DIR / "icon.ico"))
        server.shutdown()
        return

    print(f"Graphic Design Tips running at {url}  (Ctrl+C to stop)")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
