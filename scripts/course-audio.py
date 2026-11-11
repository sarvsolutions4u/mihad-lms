"""
Make the voice audio for a built-in course (run once when the course text changes).

    python3 scripts/course-audio.py src/data/course-library/spoken-english-everyday.json <kokoro.onnx> <voices.bin>

Uses Kokoro (open-source text-to-speech, Apache-2.0), runs on this computer — no AI account.
Writes public/courses/<course key>/<item key>-<n>.mp3 (one small file per line, ~20 KB)
and adds "audio" paths into the JSON. Lines whose MP3 already exists are skipped.
"""
import json
import os
import subprocess
import sys
import tempfile

import soundfile as sf
from kokoro_onnx import Kokoro

src, model, voices = sys.argv[1], sys.argv[2], sys.argv[3]
course = json.load(open(src, encoding="utf-8"))
out_dir = os.path.join("public", "courses", course["key"])
os.makedirs(out_dir, exist_ok=True)
k = Kokoro(model, voices)

VOICE = {"f": "af_heart", "m": "am_michael"}  # clear US-English voices
SPEED = 0.92  # a little slower than normal, for learners

made = skipped = 0
for unit in course["units"]:
    for item in unit["items"]:
        for n, line in enumerate(item.get("lines", []), start=1):
            name = f"{item['key']}-{n}.mp3"
            path = os.path.join(out_dir, name)
            line["audio"] = f"/courses/{course['key']}/{name}"
            if os.path.exists(path):
                skipped += 1
                continue
            samples, rate = k.create(line["text"], voice=VOICE.get(line.get("voice"), "af_heart"), speed=SPEED, lang="en-us")
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                sf.write(tmp.name, samples, rate)
            subprocess.run(
                ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-af", "apad=pad_dur=0.25", "-ac", "1", "-ar", "24000", "-b:a", "40k", path],
                check=True,
            )
            os.unlink(tmp.name)
            made += 1
            print(f"  {name}  {line['text'][:60]}", flush=True)

json.dump(course, open(src, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"done: {made} made, {skipped} already there")
