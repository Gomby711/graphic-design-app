"""Extract a short clip from a lesson's source YouTube video and turn it into
the demo gif used by a specific lesson bullet.

Downloads only the requested time range (via yt-dlp --download-sections),
converts it to a palette-optimized gif (via ffmpeg), saves it to
app/static/gifs/<lesson_id>/<index>.gif, and adds/updates that mapping in
app/gif_manifest.json so the frontend picks it up automatically.

Usage:
  python scripts/make_lesson_gif.py --lesson 1-smudge-edges --index 0 \
      --video WQHEkiUSSGI --start 00:00:12 --end 00:00:18

  --start/--end accept HH:MM:SS, MM:SS, or plain seconds.
  --fps and --width control gif size/quality (defaults: 12fps, 640px wide).
"""

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
STATIC = APP_DIR / "static"
MANIFEST = APP_DIR / "gif_manifest.json"


def run(cmd):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def make_gif(video_id, start, end, out_path, fps=12, width=640):
    url = f"https://www.youtube.com/watch?v={video_id}"
    with tempfile.TemporaryDirectory() as tmp:
        clip_path = Path(tmp) / "clip.mp4"
        run([
            sys.executable, "-m", "yt_dlp",
            "-f", "best[height<=720]",
            "--download-sections", f"*{start}-{end}",
            "-o", str(clip_path),
            url,
        ])
        palette = Path(tmp) / "palette.png"
        filters = f"fps={fps},scale={width}:-1:flags=lanczos"
        run([
            "ffmpeg", "-y", "-i", str(clip_path),
            "-vf", f"{filters},palettegen",
            str(palette),
        ])
        out_path.parent.mkdir(parents=True, exist_ok=True)
        run([
            "ffmpeg", "-y", "-i", str(clip_path), "-i", str(palette),
            "-lavfi", f"{filters}[x];[x][1:v]paletteuse",
            str(out_path),
        ])


def update_manifest(lesson_id, index, rel_path):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault(lesson_id, {})[str(index)] = rel_path
    # keep numeric keys in a stable, readable order
    def sort_key(k):
        try:
            return (0, int(k))
        except ValueError:
            return (1, k)
    manifest[lesson_id] = {
        k: manifest[lesson_id][k]
        for k in sorted(manifest[lesson_id], key=sort_key)
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--lesson", required=True, help="lesson id, e.g. 1-smudge-edges")
    ap.add_argument("--index", required=True, type=int, help="flat bullet index this gif maps to")
    ap.add_argument("--video", required=True, help="YouTube video id")
    ap.add_argument("--start", required=True, help="clip start (HH:MM:SS, MM:SS, or seconds)")
    ap.add_argument("--end", required=True, help="clip end (HH:MM:SS, MM:SS, or seconds)")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--width", type=int, default=640)
    args = ap.parse_args()

    rel_path = f"gifs/{args.lesson}/{args.index}.gif"
    out_path = STATIC / rel_path

    make_gif(args.video, args.start, args.end, out_path, fps=args.fps, width=args.width)
    update_manifest(args.lesson, args.index, rel_path)
    print(f"Wrote {out_path} and updated gif_manifest.json[{args.lesson!r}][{args.index!r}]")


if __name__ == "__main__":
    main()
