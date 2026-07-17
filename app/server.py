"""Graphic Design Tips — local server.

Serves the lesson viewer frontend and exposes lessons.json + gif_manifest.json
as a single API payload.

Run:  python server.py          (then open http://127.0.0.1:8931)
      python server.py --window (native desktop window via pywebview)
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.request
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from version import APP_VERSION

FROZEN = bool(getattr(sys, "frozen", False))
APP_DIR = Path(sys._MEIPASS) if FROZEN else Path(__file__).resolve().parent
STATIC = APP_DIR / "static"
PORT = 8931
GITHUB_REPO = "Gomby711/graphic-design-app"

_webview_window = None


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
        if url.path == "/api/version":
            body = json.dumps({"version": APP_VERSION, "frozen": FROZEN}).encode("utf-8")
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

    def do_POST(self):
        url = urlparse(self.path)
        if url.path == "/api/update":
            try:
                info = perform_update()
                self._send(200, json.dumps(info).encode("utf-8"), "application/json; charset=utf-8")
                threading.Timer(0.5, trigger_restart).start()
            except Exception as exc:
                self._send(500, json.dumps({"error": str(exc)}).encode("utf-8"), "application/json; charset=utf-8")
            return
        self._send(404, b"not found", "text/plain")


def perform_update():
    """Download the latest GitHub release build and stage a self-replacing update.

    Only works for the packaged (frozen) Windows app: it downloads the release
    zip, extracts it, and hands off to a batch script that waits for this
    process to exit, copies the new files over the current install directory,
    and relaunches the app.
    """
    if not FROZEN:
        raise RuntimeError("Auto-update is only available in the packaged Windows app.")
    if sys.platform != "win32":
        raise RuntimeError("Auto-update is only supported on Windows.")

    api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
    with urllib.request.urlopen(api_url, timeout=15) as resp:
        release = json.loads(resp.read().decode("utf-8"))

    asset = next((a for a in release.get("assets", []) if a["name"].lower().endswith(".zip")), None)
    if not asset:
        raise RuntimeError("The latest release has no downloadable Windows build.")

    tmp_root = Path(tempfile.mkdtemp(prefix="gdt_update_"))
    zip_path = tmp_root / asset["name"]
    urllib.request.urlretrieve(asset["browser_download_url"], zip_path)

    new_dir = tmp_root / "new"
    new_dir.mkdir()
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(new_dir)

    current_exe = Path(sys.executable)
    install_dir = current_exe.parent
    bat_path = tmp_root / "update.bat"
    bat_path.write_text(
        "@echo off\r\n"
        f"set PID={os.getpid()}\r\n"
        ":wait\r\n"
        'tasklist /FI "PID eq %PID%" 2>NUL | find "%PID%" >NUL\r\n'
        "if not errorlevel 1 (\r\n"
        "  timeout /t 1 /nobreak >nul\r\n"
        "  goto wait\r\n"
        ")\r\n"
        f'robocopy "{new_dir}" "{install_dir}" /E /IS /IT /NFL /NDL /NJH /NJS /R:3 /W:1 >NUL\r\n'
        f'start "" "{current_exe}"\r\n'
        f'rmdir /s /q "{tmp_root}" 2>NUL\r\n'
        "(goto) 2>nul & del \"%~f0\"\r\n",
        encoding="utf-8",
    )

    subprocess.Popen(
        ["cmd", "/c", str(bat_path)],
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
        close_fds=True,
    )
    return {"version": release.get("tag_name", "").lstrip("v")}


def trigger_restart():
    global _webview_window
    try:
        if _webview_window is not None:
            _webview_window.destroy()
    except Exception:
        pass
    os._exit(0)


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"

    if FROZEN or "--window" in sys.argv:
        import ctypes
        if sys.platform == "win32":
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "GraphicDesignTips.App")
        import webview
        global _webview_window
        threading.Thread(target=server.serve_forever, daemon=True).start()
        _webview_window = webview.create_window("Graphic Design Tips", url,
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
