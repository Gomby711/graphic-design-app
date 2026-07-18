"""Make a lesson gif from an already-downloaded local source video instead of
re-fetching from YouTube each time. Mirrors make_lesson_gif.py's ffmpeg
settings and manifest update logic exactly.

Usage:
  python scripts/clip_local_gif.py --src tmp/src/VIDEOID.mp4 --lesson 19-dodge-burn \
      --index 0 --start 44 --end 51
"""
import argparse
import json
import subprocess
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
STATIC = APP_DIR / "static"
MANIFEST = APP_DIR / "gif_manifest.json"


def run(cmd):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def make_gif(src, start, end, out_path, fps=12, width=640):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    palette = out_path.parent / f"_palette_{out_path.stem}.png"
    filters = f"fps={fps},scale={width}:-1:flags=lanczos"
    run([
        "ffmpeg", "-y", "-ss", str(start), "-to", str(end), "-i", str(src),
        "-vf", f"{filters},palettegen", str(palette),
    ])
    run([
        "ffmpeg", "-y", "-ss", str(start), "-to", str(end), "-i", str(src),
        "-i", str(palette),
        "-lavfi", f"{filters}[x];[x][1:v]paletteuse",
        str(out_path),
    ])
    palette.unlink(missing_ok=True)


def update_manifest(lesson_id, index, rel_path):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    manifest.setdefault(lesson_id, {})[str(index)] = rel_path

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
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--lesson", required=True)
    ap.add_argument("--index", required=True, type=int)
    ap.add_argument("--start", required=True, type=float)
    ap.add_argument("--end", required=True, type=float)
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--width", type=int, default=640)
    args = ap.parse_args()

    rel_path = f"gifs/{args.lesson}/{args.index}.gif"
    out_path = STATIC / rel_path
    make_gif(args.src, args.start, args.end, out_path, fps=args.fps, width=args.width)
    update_manifest(args.lesson, args.index, rel_path)
    print(f"Wrote {out_path} and updated gif_manifest.json[{args.lesson!r}][{args.index!r}]")


if __name__ == "__main__":
    main()
