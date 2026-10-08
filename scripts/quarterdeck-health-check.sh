#!/usr/bin/env bash
# Firstmate custom check: no output on health/skip, one diagnostic on failure.
set -u
state=${FM_QUARTERDECK_HEALTH_STATE_DIR:-${FM_HOME:+$FM_HOME/state}}
if [[ -z "$state" ]]; then
  state=$(cd -- "$(dirname -- "$0")" && pwd -P)
fi
fail() { printf '%s\n' 'Quarterdeck health: check unavailable (configuration, dependency or deadline)'; }
if [[ ! -d "$state" ]] || ! command -v python3 >/dev/null || ! command -v timeout >/dev/null || ! command -v flock >/dev/null; then
  fail
  exit 0
fi
# Serialize attempts and keep all bookkeeping in the selected Firstmate state.
exec 9>"$state/quarterdeck-health.lock" 2>/dev/null || { fail; exit 0; }
flock -n 9 || exit 0
if ! timeout 25 python3 - "$state" 2>/dev/null <<'PY'
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request

class Unhealthy(Exception):
    pass

def reject(message):
    raise Unhealthy(message)

def probe(url):
    # Never inherit an HTTP proxy for loopback/private health reads.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(url, timeout=3) as response:
            data = response.read(1024 * 1024 + 1)
            if len(data) > 1024 * 1024:
                reject('response too large')
            return json.loads(data)
    except Unhealthy:
        raise
    except Exception:
        reject('endpoint unavailable or invalid JSON')

def snapshot(base, age):
    data = probe(base + '/api/bearings')
    if not isinstance(data, dict) or data.get('schema') != 'fm-quarterdeck-call.v1' or data.get('state') != 'ready':
        reject("Captain's Call snapshot not ready")
    if data.get('stale') is True:
        reject("Captain's Call snapshot stale")
    try:
        stamp = datetime.datetime.fromisoformat(data['generatedAt'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            raise ValueError()
        elapsed = time.time() - stamp.timestamp()
    except Exception:
        reject("Captain's Call snapshot timestamp missing or invalid")
    if elapsed < -60 or elapsed > age:
        reject("Captain's Call snapshot stale")

def main():
    state = Path(sys.argv[1])
    config_path = state / 'quarterdeck-health.json'
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    def setting(key, default=''):
        return os.environ.get(key, config.get(key, default))
    stamp = state / 'quarterdeck-health.stamp'
    now = time.time()
    if setting('FM_QUARTERDECK_HEALTH_FORCE') != '1' and stamp.exists():
        elapsed = now - float(stamp.read_text())
        if 0 <= elapsed < 600:
            return
    stamp.write_text(str(now))  # Throttle failed attempts too; watcher wake owns recovery.
    port = str(setting('FM_QUARTERDECK_HEALTH_PORT'))
    tailnet = setting('FM_QUARTERDECK_HEALTH_URL')
    if not port or not tailnet:
        try:
            result = subprocess.run(
                [setting('TAILSCALE_BIN', 'tailscale'), 'serve', 'status', '--json'],
                capture_output=True, timeout=3, check=True)
            routes = []
            for host, web in json.loads(result.stdout).get('Web', {}).items():
                proxy = web.get('Handlers', {}).get('/', {}).get('Proxy', '')
                target = urllib.parse.urlsplit(proxy)
                if host.endswith(':443') and target.scheme == 'http' and target.hostname in ('127.0.0.1', 'localhost', '::1') and target.port:
                    routes.append((str(target.port), 'https://' + host[:-4]))
            if len(routes) != 1:
                raise ValueError()
            discovered_port, discovered_url = routes[0]
            port = port or discovered_port
            tailnet = tailnet or discovered_url
        except FileNotFoundError:
            # Explicit local-only configuration is valid without Tailscale.
            if not port or tailnet:
                reject('Serve route discovery unavailable or ambiguous')
        except Exception:
            reject('Serve route discovery unavailable or ambiguous')
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        reject('local port not configured')
    age = int(setting('FM_QUARTERDECK_HEALTH_MAX_AGE', '900'))
    if not 1 <= age <= 86400:
        reject('snapshot age limit invalid')
    local = 'http://127.0.0.1:' + port
    health = probe(local + '/api/health')
    if not isinstance(health, dict) or health.get('ok') is not True:
        reject('local server unhealthy')
    snapshot(local, age)
    if tailnet:
        url = urllib.parse.urlsplit(tailnet)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
            reject('private HTTPS origin invalid')
        health = probe(tailnet.rstrip('/') + '/api/health')
        if not isinstance(health, dict) or health.get('ok') is not True:
            reject('private HTTPS server unhealthy')
        snapshot(tailnet.rstrip('/'), age)

try:
    main()
except Unhealthy as error:
    print('Quarterdeck health: ' + str(error))
except Exception:
    print('Quarterdeck health: invalid configuration or state')
PY
then
  fail
fi
exit 0
