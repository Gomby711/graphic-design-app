# Graphic Design Tips

A desktop lesson viewer for Evan's "Graphic Design Knowledge & Tips" PDF, built the same way as `learning-code/app`: a small local Python server plus a static HTML/CSS/JS frontend.

## Running it

```
python app/server.py            # opens in your default browser at http://127.0.0.1:8931
python app/server.py --window   # opens in a native desktop window (requires pywebview)
```

Or double-click `app/launch.vbs` for a one-click native window launch with no console.

## Structure

- `app/lessons.json` — all 24 lessons (I-VIII fundamentals — 4 from the PDF, 4 researched design-theory topics — plus tabs 1-16 with embedded YouTube tutorials).
- `app/gif_manifest.json` — maps each lesson's bullet points to a short demo GIF cut from its tutorial video.
- `app/static/gifs/<lesson-id>/<bullet-index>.gif` — the actual GIF files.
- `app/server.py` — serves the frontend and merges lessons.json + gif_manifest.json into `/api/lessons`.
- `app/static/` — frontend (index.html, style.css, app.js).

## Coverage notes

Every bullet's GIF was cut from the exact YouTube video linked in that lesson, timed to the moment the bullet's action is demonstrated. Two lessons have partial GIF coverage because their linked tutorial doesn't show every technique the PDF describes:

- **Lesson 3 (Touch Up)**: only "Spot Healing"-equivalent removal and Frequency Separation are demonstrated in the linked video; Clone Stamp, the Remove tool, Generative Fill, and Liquify aren't shown in it.
- **Lesson 6 (Spacing)**: only the basic Distribute-icon click is demonstrated; the Move-tool shortcut, exact-pixel Properties panel spacing, and the manual spacer-shape technique aren't shown in the linked video.

If you'd like fuller coverage on those two, swap in a more complete tutorial video and re-run the same yt-dlp/ffmpeg gif-cutting process.
