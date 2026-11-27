# syntax=docker/dockerfile:1.7
# The lesson video narrator (server.py): Kokoro text to speech on the CPU. About 650 MB with the model; it needs no
# network at runtime. Behind a TLS-inspecting proxy, pass its CA as the extra_ca build secret (see compose.yaml).
FROM python:3.12.13-slim-trixie

ARG KOKORO_RELEASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
# sha256 of the model files, so a changed download fails the build instead of changing the voice.
ARG MODEL_SHA256=6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb
ARG VOICES_SHA256=bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d

ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=secret,id=extra_ca,required=false \
    set -e; \
    if [ -s /run/secrets/extra_ca ]; then cat /etc/ssl/certs/ca-certificates.crt /run/secrets/extra_ca > /tmp/ca.pem; export PIP_CERT=/tmp/ca.pem SSL_CERT_FILE=/tmp/ca.pem; fi; \
    for n in 1 2 3; do pip install --retries 5 -r requirements.txt && break; [ "$n" = 3 ] && exit 1; sleep $((n * 15)); done; \
    mkdir -p /models; \
    python - "$KOKORO_RELEASE" "$MODEL_SHA256" "$VOICES_SHA256" <<'PY'
import hashlib, sys, time, urllib.request
base, model_sha, voices_sha = sys.argv[1:4]
for name, want in (("kokoro-v1.0.int8.onnx", model_sha), ("voices-v1.0.bin", voices_sha)):
    for attempt in range(5):
        try:
            data = urllib.request.urlopen(f"{base}/{name}", timeout=300).read()
            break
        except Exception as err:
            if attempt == 4: raise
            print(f"download {name} failed ({err}), retrying", flush=True); time.sleep(10 * (attempt + 1))
    got = hashlib.sha256(data).hexdigest()
    if got != want: sys.exit(f"{name}: sha256 {got}, expected {want}")
    open(f"/models/{name}", "wb").write(data)
PY
RUN rm -f /tmp/ca.pem && useradd --uid 1000 --create-home --shell /usr/sbin/nologin narrator
COPY server.py .
USER narrator
EXPOSE 8880
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=30 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8880/health', timeout=2).status == 200 else 1)"]
CMD ["python", "server.py"]
