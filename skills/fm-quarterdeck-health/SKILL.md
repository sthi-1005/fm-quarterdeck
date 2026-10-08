---
name: fm-quarterdeck-health
description: Initialize or consume Quarterdeck with a persistent health watcher; on /afk, away mode or quiet supervision, keep the dashboard active and make occasional health check-ins.
user-invocable: true
---

# Quarterdeck health supervision

This Quarterdeck-owned skill is for the supervising Firstmate, not permission for workers to administer shared services. Source presence does not activate it. Follow `docs/FIRSTMATE-INTEGRATIONS.md` for authorized, pinned discovery and rollback. Resolve the canonical Quarterdeck repository from this skill directory (two parents); never guess a home or installation hostname.

## Set up the persistent check

When initializing/consuming Quarterdeck, select the explicit initialized `FM_HOME`, confirm authority over its dashboard process and the exact private Serve route, and register a Firstmate custom watcher check. Do not replace an unknown existing check, config or symlink; inspect and preserve a verified rollback copy before an authorized update.

1. Verify the installed Firstmate provides `bin/fm-check-register.sh` and `bin/fm-check-unregister.sh`. If not, report registration unavailable; do not invent an alternative scheduler.
2. Use check id `quarterdeck-health` (or another explicitly selected safe id). Copy the approved repository's `scripts/quarterdeck-health-check.sh` to `FM_HOME/state/<id>.check.sh`, mode **0700**. Set a restrictive umask and retain private config mode 0600. For the default id:
   ```bash
   umask 077
   install -m 0700 "$QUARTERDECK_ROOT/scripts/quarterdeck-health-check.sh" "$FM_HOME/state/quarterdeck-health.check.sh"
   (cd "$FM_HOME" && bin/fm-check-register.sh quarterdeck-health)
   ```
   `QUARTERDECK_ROOT` is the verified pinned source root. The copied script is self-contained. It uses `FM_HOME/state`, or its own directory when the watcher does not export `FM_HOME`. All copies in one state directory share a lock and ten-minute attempt stamp.
3. Store private settings in `FM_HOME/state/quarterdeck-health.json`, a JSON object of the environment keys below; actual environment variables override it. This persists configuration across fresh Firstmate sessions without assuming the watcher inherits a launch shell. Use no private values in committed files.
4. Run the registered script once with `FM_QUARTERDECK_HEALTH_FORCE=1`, confirm it is silent, and confirm registration with the installed watcher's documented inspection procedure. A registration command succeeding is not evidence the service is healthy. Record the check id, exact owned route, process/launch method, source revision and config privately for the next Firstmate.

Settings (environment or private JSON):

- `FM_QUARTERDECK_HEALTH_PORT`: explicit loopback port; otherwise discover the unique HTTPS root proxy's loopback port with bounded `tailscale serve status --json`.
- `FM_QUARTERDECK_HEALTH_URL`: exact private HTTPS origin reachable from the operator's network side. Otherwise discover that same Serve route's HTTPS origin. Discovery ambiguity fails closed; no real hostname is baked in.
- `TAILSCALE_BIN`: optional Tailscale executable path, otherwise PATH `tailscale`.
- `FM_QUARTERDECK_HEALTH_MAX_AGE`: snapshot age seconds, default 900, range 1–86400.
- `FM_QUARTERDECK_HEALTH_STATE_DIR`: optional explicit bookkeeping/config directory; normally leave unset.
- `FM_QUARTERDECK_HEALTH_FORCE=1`: manual post-repair verification, bypasses ten-minute throttle.

If Tailscale is unavailable and a port is explicitly configured, local-only checking is possible. Record that remote reachability is **unverified**, not healthy from the captain's side. To require remote checks, explicitly configure the URL; failure never falls back to local-only. The checker probes `/api/health` (`ok: true`) and `/api/bearings` on local and available remote origins. Bearings must have schema `fm-quarterdeck-call.v1`, `state: "ready"`, no `stale: true`, and a timezone-bearing ISO `generatedAt` within the age limit (at most 60 seconds in the future). Missing endpoint/schema is an actionable compatibility failure, not a successful check. Use the wire contract in `prototype/BEARINGS.md`; escalate a missing or incompatible producer rather than substituting a request-time timestamp or weakening readiness checks.

Dependencies: Bash, Python 3, `timeout`, `flock`; Tailscale only for discovery. Reads have three-second budgets, a one-MiB response cap and a 25-second overall deadline. No output means healthy **or throttled/concurrent skip**; use a forced run to establish fresh evidence. Failures print exactly one sanitized line, without private URLs, paths, responses or command diagnostics. Checks never mutate services, Serve routes or preferences.

## /afk and quiet supervision

Keep the check registered while Quarterdeck is expected to be active, including `/afk`, away mode and quiet supervision. Reuse Firstmate's custom-check watcher; do not busy-poll or start another daemon. Its repeated invocation is throttled to about ten minutes. At occasional normal supervision checkpoints, confirm registration remains present and review fresh health evidence; local-only skips do not establish remote availability. Do not send routine healthy chatter or wake the captain for each check.

## Failure wake and recovery

On a watcher failure wake, inspect the one-line signal and bounded local evidence. Under established maintenance authority, restore the owned dashboard: launch/restart the clean approved revision on a **fresh free loopback port**, retaining the selected Firstmate home and existing private state owner; repoint **only the proven owned** Tailscale Serve handler to that port; verify the local and private URL health and ready/non-stale Bearings snapshot. Follow `docs/tailscale-launch.md` ownership and namespace rules. Never kill by port/name, reset Serve, enable Funnel, replace private state, or touch another service's handler. An unowned/changed route or missing maintenance authority requires escalation rather than takeover.

Verify from the captain's network side where available (operator-side remote network probe/browser), not solely server loopback. The watcher's operator-network request is useful but does not prove a separate captain device's ACL or browser access. If that side is inaccessible, report the verification gap explicitly. A missing Bearings producer requires a bounded compatibility investigation, not repeated restarts. Force the check after repair, then briefly report the failure, repair and verified reachability/freshness (or remaining limitation). Keep the check registered after recovery.

Retire only when Quarterdeck is deliberately decommissioned or monitoring is explicitly withdrawn: `(cd "$FM_HOME" && bin/fm-check-unregister.sh <id>)`. Inspect ownership before removing this check's private files; do not unregister other checks. Temporary captain absence is not retirement.
