# Snck Laravel Migration Architecture

## Decision

Snck will migrate incrementally from the current React/Vite/Express application to Laravel/PHP without replacing the working Node.js node-daemon. Laravel becomes the panel’s web and API authority; the node-daemon remains the authenticated Docker control plane on each node VPS.

The first cutover must preserve the current panel while the Laravel foundation is introduced. Existing `.data/*.json` files are treated as an import source only. New panel state is stored in MySQL or MariaDB through Laravel migrations and Eloquent models.

## Target runtime

| Layer | Technology | Responsibility |
|---|---|---|
| Web/API | Laravel 11 or current supported Laravel release | Authentication, authorization, panel routes, node/server/allocation APIs, jobs, backups metadata |
| UI shell | Blade + Tailwind CSS | Layout, navigation, auth/setup pages, admin pages, server pages |
| Interactive components | TypeScript with Vue or React islands | Terminal streaming, File Manager, upload progress, telemetry charts |
| Database | MySQL 8 or MariaDB 10.6+ | Users, nodes, servers, allocations, backups, settings, audit events |
| Node control | Existing Node.js daemon | Docker operations, daemon health, remote files, logs, stats, SFTP |
| Runtime | Docker Compose | Laravel/PHP-FPM, Nginx, MySQL/MariaDB, queue worker, scheduler |

## Core schema

### users

`id`, `name`, `username`, `email`, `password`, `role`, `google_id`, `email_verified_at`, `password_version`, `remember_token`, `created_at`, `updated_at`.

Roles are `owner`, `admin`, and `user`. Owner-only actions are enforced in Laravel policies and route middleware, not only in Blade visibility conditions.

### nodes

`id`, `name`, `host`, `fqdn`, `public_port`, `daemon_port`, `sftp_port`, `protocol`, `behind_proxy`, `tls_verify`, `access_client_id`, `access_client_secret_encrypted`, `credential_encrypted`, `status`, `last_heartbeat_at`, `docker_available`, `maintenance`, `server_directory`, `created_at`, `updated_at`.

Cloudflare Access secrets are encrypted with Laravel’s application encryption and are never returned by ordinary API resources.

### servers

`id`, `node_id`, `name`, `identifier`, `container_id`, `image`, `version`, `status`, `memory_limit`, `cpu_limit`, `disk_limit`, `startup_command`, `environment_json`, `suspend`, `created_at`, `updated_at`.

### allocations

`id`, `node_id`, `ip`, `port`, `alias`, `assigned_server_id`, `notes`, `created_at`, `updated_at`.

A unique constraint on `(node_id, ip, port)` prevents duplicates. Port ranges are expanded into independent allocation rows so each port can be assigned separately.

### backups

`id`, `server_id`, `filename`, `size_bytes`, `checksum`, `status`, `progress`, `storage_path`, `node_backup_id`, `created_at`, `completed_at`, `failed_at`.

Backup creation and restore are asynchronous Laravel jobs. The UI polls a status endpoint or subscribes through broadcasting; it does not assume an HTTP request has completed the archive operation.

### settings and audit_events

Settings are keyed values with encrypted values for secrets. Audit events record actor, action, resource type, resource ID, metadata, and IP address for Owner/Admin operations.

## Node contract

Laravel calls the existing daemon through a dedicated `NodeClient` service. The service must preserve the existing authenticated REST contract for:

- health and authenticated heartbeat;
- Docker readiness;
- server/container create, start, stop, restart, delete, status, stats, and logs;
- file list, read, write, create, rename, delete, upload chunks, and archive operations;
- SFTP user provisioning.

The Laravel NodeClient normalizes public FQDN/proxy configuration in one place. A public Cloudflare endpoint uses HTTPS on 443 while the Tunnel may forward internally to HTTP on origin port 8080.

## Authentication and cutover

The migration begins with Laravel session authentication and a first-run `/setup` Owner flow. Passwords use Laravel’s password hashing. Existing bcrypt password hashes can be imported without rehashing; Laravel may rehash them on successful login when its configured cost changes.

During migration, the current Node/React panel remains the fallback application. A feature flag chooses the Laravel panel for selected routes only after each workflow passes integration tests. No JSON data is deleted until a verified MySQL import and backup have been completed.

## Import rules

The importer reads current files from `.data` using a read-only pass, validates records, maps IDs without changing them where possible, upserts users/nodes/servers/allocations, records skipped or malformed records, and writes an import report. Password hashes and encrypted node credentials are preserved only when their source format is supported; otherwise the importer requires an explicit credential reset rather than guessing.

## Deployment order

1. Add Laravel/PHP-FPM, Nginx, and MySQL/MariaDB Docker services.
2. Add migrations, models, policies, health checks, and the JSON importer.
3. Import a copy of `.data` into a staging database.
4. Implement setup/login and user management.
5. Implement nodes, allocations, and server lifecycle using the existing daemon protocol.
6. Migrate File Manager, terminal, telemetry, backups, and archive operations.
7. Run parallel smoke tests against the old and new panel paths.
8. Switch the panel route to Laravel only after rollback artifacts and database backups are verified.

## Non-goals for the first foundation stage

The first stage will not delete the current React/Express panel, rewrite the node-daemon in PHP, or silently convert live production data. Those actions would risk losing working functionality and node connectivity.
