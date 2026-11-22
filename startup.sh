#!/bin/bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
SHOTPILOT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SHOTPILOT_ROOT"
SHOTPILOT_PORT="${SHOTPILOT_PORT:-5175}"
case "$SHOTPILOT_PORT" in
  ''|*[!0-9]*) echo "SHOTPILOT_PORT must be a port number." >&2; exit 1 ;;
esac
if (( SHOTPILOT_PORT < 1024 || SHOTPILOT_PORT > 65535 )); then
  echo "Choose a port between 1024 and 65535." >&2
  exit 1
fi
SHOTPILOT_OPEN=1
case "${1:-}" in
  --no-open|--check) SHOTPILOT_OPEN=0 ;;
  '') ;;
  *) echo "Usage: ./startup.sh [--no-open|--check]" >&2; exit 1 ;;
esac
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ShotPilot needs Node.js 22.12 or newer. Install Node.js, then run this script again." >&2
  exit 1
fi
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<12)){console.error("ShotPilot needs Node.js 22.12 or newer.");process.exit(1)}'

if [[ ! -d node_modules ]]; then
  if [[ "${1:-}" == "--check" ]]; then
    echo "Dependencies missing. Run ./startup.sh to install and build." >&2
    exit 1
  fi
  npm ci --no-audit --no-fund
fi
if [[ ! -f dist/index.html ]]; then
  if [[ "${1:-}" == "--check" ]]; then
    echo "Production build missing. Run ./startup.sh to build." >&2
    exit 1
  fi
  npm run build
fi

SHOTPILOT_URL="http://127.0.0.1:${SHOTPILOT_PORT}/ShotPilot/"
if [[ "${1:-}" == "--check" ]]; then
  echo "ShotPilot is ready: $SHOTPILOT_ROOT"
  echo "$SHOTPILOT_URL"
  exit 0
fi

# Reuse only a server running from this exact project directory.
if command -v lsof >/dev/null 2>&1; then
  SHOTPILOT_PID="$(lsof -nP -tiTCP:"$SHOTPILOT_PORT" -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "$SHOTPILOT_PID" ]]; then
    SHOTPILOT_RUNNING_ROOT="$(lsof -a -p "$SHOTPILOT_PID" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
    if [[ "$SHOTPILOT_RUNNING_ROOT" != "$SHOTPILOT_ROOT" ]]; then
      echo "Port $SHOTPILOT_PORT is used by another app. Choose another SHOTPILOT_PORT." >&2
      exit 1
    fi
    echo "ShotPilot is already running: $SHOTPILOT_URL"
    if [[ "$SHOTPILOT_OPEN" == 1 ]]; then
      if command -v open >/dev/null 2>&1; then open "$SHOTPILOT_URL";
      elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$SHOTPILOT_URL"; fi
    fi
    exit 0
  fi
fi

echo "Starting ShotPilot: $SHOTPILOT_URL"
echo "Keep this terminal open. Press Ctrl+C to stop ShotPilot."
if [[ "$SHOTPILOT_OPEN" == 1 ]]; then
  exec npm run preview -- --host 127.0.0.1 --port "$SHOTPILOT_PORT" --strictPort --open /ShotPilot/
else
  exec npm run preview -- --host 127.0.0.1 --port "$SHOTPILOT_PORT" --strictPort
fi
