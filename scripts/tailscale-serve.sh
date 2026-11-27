#!/bin/sh
# Publishes LF Cert Trainer on your tailnet with HTTPS, using `tailscale serve` on this server. Only devices in
# your tailnet (and machines you share this server with) can reach it; nothing is opened to the internet.
#
#   https://<name>.ts.net         the app                   -> 127.0.0.1:4000
#   https://<name>.ts.net:8443    lab terminal (WebSocket)  -> 127.0.0.1:4001
#   https://<name>.ts.net:8444    docs pane: kubernetes.io  -> 127.0.0.1:4011
#   https://<name>.ts.net:8445    docs pane: helm.sh        -> 127.0.0.1:4012
#
# Needs MagicDNS and HTTPS certificates turned on for the tailnet (admin console > DNS). The settings persist
# across reboots; `tailscale serve reset` removes them. Run it again after changing ports.
set -eu

command -v tailscale > /dev/null 2>&1 || { echo "Tailscale is not installed (see docs/self-hosting.md)." >&2; exit 1; }
ts="tailscale"
[ "$(id -u)" = "0" ] || ts="sudo tailscale"

web="${WEB_PORT:-4000}"
controller="${LAB_CONTROLLER_PORT:-4001}"

$ts serve --bg --https=443 "http://127.0.0.1:$web"
$ts serve --bg --https=8443 "http://127.0.0.1:$controller"
$ts serve --bg --https=8444 "http://127.0.0.1:4011"
$ts serve --bg --https=8445 "http://127.0.0.1:4012"
$ts serve status
