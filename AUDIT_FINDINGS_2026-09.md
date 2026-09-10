# Snck production audit findings

## Confirmed baseline

The active production path is the React/Vite/Express/JSON panel. A Laravel 12/MySQL foundation exists in `laravel-panel/`, but the main server still initializes and reads `.data/*.json`. The node daemon is a separate TypeScript service with systemd installers.

## Positive checks

The current source passes the existing TypeScript/lint and production build checks. `install.sh`, `node-daemon/install.sh`, and `shironex` pass Bash syntax validation. No tracked `.env`, private-key, or credential-named files were found in the initial tracked-file scan; `.env.example` files are present as templates.

## Production risks requiring follow-up

1. The native panel installer and local node installer need end-to-end Ubuntu validation, including Docker unavailable/runtime fallback, systemd environments, alternate Node.js paths, and authenticated heartbeat confirmation.
2. The main application still relies on JSON storage despite the Laravel/MySQL migration foundation. Concurrent writes and process crashes need a safe migration/locking strategy before switching production storage.
3. Socket.IO is configured with `origin: "*"`; this should be restricted for production deployments while preserving local development behavior.
4. The Socket.IO `joinServer` handler currently joins a requested server room based on the client-provided server ID. It must verify that the authenticated user owns or is authorized to access the requested server before joining or streaming logs.
5. Remote node health and deployment depend on endpoint, TLS, Cloudflare, credential, Docker, and heartbeat states; these need integration coverage rather than only source-level checks.
6. The generated node systemd service must use the actual Node.js path on Ubuntu fallback installations; this has been addressed in the latest installer changes but needs fresh-VPS verification.
7. Generated source archives and vendored Laravel files need repository hygiene review before final migration commits; large historical archives should not be used as installation dependencies.

## Current priority order

Installer and node lifecycle reliability first, then authorization/Socket.IO hardening, then JSON-to-MySQL migration validation, followed by broader UI/performance review.
