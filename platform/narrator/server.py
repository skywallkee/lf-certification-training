"""
The lesson video narrator: a small HTTP service that turns one sentence into speech with Kokoro (82M parameters,
Apache-2.0 weights) on the CPU, so lesson videos are narrated without any paid or online service.

    POST /speak   {"text": "...", "voice": "af_heart", "speed": 1.0}  ->  audio/mpeg
    GET  /health  ->  200 once the model is loaded
    GET  /voices  ->  the voice ids

The web app calls it once per sentence and caches the MP3 (platform/apps/web/src/server/narration.ts); this service
keeps nothing. One sentence is synthesised at a time, which keeps memory flat on a laptop.
"""

import io
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import soundfile as sf
from kokoro_onnx import Kokoro

MODEL = os.environ.get("NARRATOR_MODEL", "/models/kokoro-v1.0.int8.onnx")
VOICES = os.environ.get("NARRATOR_VOICES", "/models/voices-v1.0.bin")
PORT = int(os.environ.get("PORT", "8880"))
MAX_TEXT = 1500

# How terms that text-to-speech gets wrong should sound. Only the audio changes: captions keep the real word.
SAY = [
    (r"\bkubectl\b", "kube control"),
    (r"\bkubeadm\b", "kube admin"),
    (r"\bkubelet\b", "kube let"),
    (r"\bkube-proxy\b", "kube proxy"),
    (r"\bk8s\b", "Kubernetes"),
    (r"\betcd\b", "et-see-dee"),
    (r"\bClusterIP\b", "Cluster I P"),
    (r"\bNodePort\b", "Node Port"),
    (r"\bLoadBalancer\b", "Load Balancer"),
    (r"\bExternalName\b", "External Name"),
    (r"\bEndpointSlices?\b", lambda m: "Endpoint Slice" + ("s" if m.group(0).endswith("s") else "")),
    (r"\biptables\b", "I P tables"),
    (r"\bnftables\b", "N F tables"),
    (r"\bIPVS\b", "I P V S"),
    (r"\bCoreDNS\b", "Core D N S"),
    (r"\bYAML\b", "yammel"),
    (r"\bCNI\b", "C N I"),
    (r"\bCRDs?\b", lambda m: "C R D" + ("s" if m.group(0).endswith("s") else "")),
    (r"\bRBAC\b", "R back"),
    (r"\bTLS\b", "T L S"),
    (r"\bvs\.?\b", "versus"),
]


def spoken(text: str) -> str:
    for pattern, replacement in SAY:
        text = re.sub(pattern, replacement, text)
    return text


kokoro = Kokoro(MODEL, VOICES)
known_voices = set(kokoro.get_voices())
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "lfct-narrator"

    def log_message(self, fmt, *args):  # quieter logs: one line per synthesis instead of per request
        pass

    def send(self, status: int, body: bytes, content_type: str = "application/json"):
        self.send_response(status)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self.send(200, b'{"ok":true}')
        if self.path == "/voices":
            return self.send(200, json.dumps(sorted(known_voices)).encode())
        self.send(404, b'{"error":"not found"}')

    def do_POST(self):
        if self.path != "/speak":
            return self.send(404, b'{"error":"not found"}')
        try:
            length = int(self.headers.get("content-length", "0"))
            if length > 16_000:
                raise ValueError("request too large")
            req = json.loads(self.rfile.read(length) or b"{}")
            text = str(req.get("text", "")).strip()
            voice = str(req.get("voice", "af_heart"))
            speed = float(req.get("speed", 1.0))
            if not text or len(text) > MAX_TEXT:
                raise ValueError(f"text must be 1 to {MAX_TEXT} characters")
            if voice not in known_voices:
                raise ValueError(f"unknown voice {voice}")
            if not 0.5 <= speed <= 2.0:
                raise ValueError("speed must be between 0.5 and 2")
        except (ValueError, json.JSONDecodeError) as err:
            return self.send(400, json.dumps({"error": str(err)}).encode())
        lang = "en-gb" if voice.startswith("b") else "en-us"
        with lock:
            samples, rate = kokoro.create(spoken(text), voice=voice, speed=speed, lang=lang)
        out = io.BytesIO()
        sf.write(out, samples, rate, format="MP3")
        print(f"[narrator] {voice} {len(samples) / rate:.1f}s: {text[:60]}", flush=True)
        self.send(200, out.getvalue(), "audio/mpeg")


if __name__ == "__main__":
    print(f"[narrator] listening on :{PORT} with {len(known_voices)} voices", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
