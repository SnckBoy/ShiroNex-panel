# Snck Laravel Migration Deployment

The Laravel application is introduced incrementally under `laravel-panel/`. The existing React/Vite/Express panel remains the production fallback until the Laravel workflows are fully integrated into the operator UI. The existing Node.js daemon remains required on each game node because it owns Docker, files, logs, telemetry, and remote server lifecycle operations.

## Local validation

From the repository root:

```bash
npm ci
npm run build
cd node-daemon
npm ci
npm run build
cd ../laravel-panel
composer install --no-interaction --prefer-dist
php artisan migrate:fresh --force
php artisan test --without-tty
```

Do not run `migrate:fresh` against production. Use `php artisan migrate --force` against a production database after taking a database backup.

## Docker deployment

Copy the Laravel environment template and set a strong application key and database credentials:

```bash
cd laravel-panel
cp .env.example .env
php artisan key:generate
```

Set the database values in `.env` to match the MariaDB service in `docker-compose.yml`, then start the migration environment:

```bash
docker compose up -d --build
```

The compose foundation exposes the Laravel development server on port `8000` and stores MariaDB data in the named `snck_mariadb` volume. Replace development serving with Nginx/PHP-FPM before production exposure.

## Import legacy JSON data

Back up the current panel data first. Then run a dry import against a copy of the `.data` directory:

```bash
php artisan snck:import-json /path/to/copied/.data --dry-run
```

After reviewing the counts and skipped records, import into the staging database:

```bash
php artisan snck:import-json /path/to/copied/.data
```

The importer does not delete JSON files. It preserves supported bcrypt password hashes, users, roles, nodes, servers, and allocations. Records with missing required relationships are reported as skipped instead of being guessed.

## Node daemon update

Build and restart each node daemon from the published repository:

```bash
cd /opt/shironex-panel/node-daemon
npm ci --omit=dev
npm run build
sudo systemctl restart shironex-node
sudo systemctl status shironex-node --no-pager
```

The daemon now supports authenticated remote archive creation at `POST /v1/servers/:id/backups` in addition to the existing health, Docker, lifecycle, file, command, log, and stats endpoints.

## Cloudflare node settings

For a public node hostname such as `node.example.com`, configure Snck with the public HTTPS hostname and enable reverse-proxy mode. A Cloudflare Tunnel may forward the public route to a plain HTTP daemon origin on `127.0.0.1:8080`:

```text
Public: https://node.example.com
Tunnel origin: http://127.0.0.1:8080
Panel node: HTTPS enabled, reverse proxy enabled, public port 443, daemon origin port 8080
```

If Cloudflare Access protects the hostname, store the Access client ID and secret through the encrypted Laravel node fields. Never commit them or place them in screenshots.

## Rollback

The React/Express panel remains available during the migration. If a Laravel deployment fails, stop only the Laravel service and return traffic to the existing panel. Do not delete the current `.data` directory or node daemon configuration. Restore MySQL from its backup only when the database itself is damaged; otherwise fix or roll back the Laravel release while keeping the imported data intact.

## Current migration boundary

The published stage includes Laravel setup/login, domain migrations, JSON import, node management, allocation ranges and assignment, server creation/lifecycle calls, File Manager operations, terminal command/log/stats APIs, and node-side backup archive metadata. Blade/Tailwind panel pages for every migrated API and complete production Nginx/PHP-FPM hardening are subsequent stages; the existing panel remains the safe production UI until those pages are completed and end-to-end tested.
