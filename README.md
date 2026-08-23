# ShiroNex Hosting Panel

ShiroNex is a self-hosted game-server control panel with a distributed Linux node daemon.

## One-command Ubuntu installer

On a fresh Ubuntu 20.04 or newer VPS, run. Ubuntu 22.04 and 24.04 are the primary CI-tested releases; other Ubuntu releases use the installer’s generic compatibility fallbacks:

```bash
curl -fsSL https://raw.githubusercontent.com/SnckBoy/ShiroNex-panel/main/install.sh | sudo bash
```

The installer opens a menu with panel, node, panel-plus-node, update, repair, uninstall, system information, and **Create / Update Users** actions. After the panel starts, a fresh installation redirects to `/setup` to create the first Owner account. Non-interactive modes are also available:

```bash
sudo bash install.sh panel
sudo bash install.sh node
sudo bash install.sh both
sudo bash install.sh update
sudo bash install.sh repair
sudo bash install.sh uninstall
sudo bash install.sh users
```

After installation, the management command is available as `sudo shironex`. Use `sudo shironex --help` for panel/node service controls, logs, updates, repairs, backups, and health information.

For a panel-only VPS, select **Install ShiroNex Panel**. For a separate node-only VPS, select **Install ShiroNex Node** or use the node command generated in the panel under **Nodes → Create Node**. On the first visit to a fresh panel, open `/setup` and create the Owner account with a unique username, email, and password of at least 8 characters. `/setup` closes permanently as soon as the first user is written; the panel then uses `/login`. There is no default password and passwords are never printed to installer logs. Run the installer again and choose option 11, or run `sudo bash /opt/shironex-panel/install.sh users`, to create or update multiple Owner, Admin, and User accounts; the first account is forced to Owner. The **Panel + Node** option installs the panel first and then asks for node credentials; if credentials are not supplied, it prints the safe generated node-registration workflow instead of inventing credentials. It is designed so one panel can manage **many independent VPS nodes**, each running Docker containers locally.

## Login options

ShiroNex supports ordinary username/password login with a simple 8-256 character minimum-length rule. Passwords are still bcrypt-hashed and no password is printed or stored in plain text. Optional **Sign in with Google** is available on the production login page after enabling Google Login and entering the Firebase web-app settings in the Owner Settings page. Firebase Google Authentication must be enabled and the panel hostname must be added to Firebase Authorized domains. The browser sends a Firebase ID token and the backend verifies it with Google before accepting the login. Google sign-in creates normal User accounts; it does not replace the first Owner setup.

## Architecture

```text
                    ShiroNex Panel VPS
               ┌──────────────────────┐
               │ Web UI + API + DB     │
               │ Node management       │
               │ Allocations           │
               │ Cloudflare            │
               └──────────┬───────────┘
                          │ HTTPS
          ┌───────────────┼────────────────┐
          │               │                │
          ▼               ▼                ▼
     ShiroNex Node 1     ShiroNex Node 2      ShiroNex Node N
     VPS / Docker    VPS / Docker     VPS / Docker
       │ │ │            │ │ │            │ │ │
     Server ...       Server ...       Server ...
```

There is **no hard two-node limit**. Create as many nodes as your infrastructure and database can support. Every node has its own credential and daemon process.

ShiroNex's daemon is an independent implementation. It does not copy proprietary code from Pterodactyl/Wings. The architecture is intentionally similar at a high level: a central panel schedules servers and a per-node daemon owns Docker operations.

## Panel installation on Ubuntu

1. Copy the ShiroNex project ZIP to your panel VPS and extract it.
2. Enter the project directory.
3. Run:

```bash
sudo bash install.sh
```

The installer detects Ubuntu by distribution rather than requiring one exact release. It supports Ubuntu 20.04 and newer on `amd64` or `arm64`, installs Node.js 22 through NodeSource when available, and falls back to the official Node.js binary when a release codename has no NodeSource package. Docker similarly falls back to the Ubuntu/Debian distribution package when Docker’s upstream repository does not publish the detected codename. It installs dependencies, creates `.env` secrets when missing, builds ShiroNex, and starts it with PM2 on port `6767`. Ubuntu versions older than 20.04 are intentionally rejected because their system libraries are too old for the current Node.js 22 production runtime; upgrade the VPS rather than bypassing this check.

Open:

```text
http://YOUR_PANEL_IP:6767
```

For production, put ShiroNex behind HTTPS using your preferred reverse proxy and firewall the application appropriately.

## Create and connect a node

1. Log in as an administrator.
2. Open **Nodes → Create Node**.
3. Enter the node name, hostname/FQDN, public IP and API port.
4. Enable TLS when the node endpoint has a valid certificate.
5. Create the node.
6. ShiroNex displays a **temporary setup command**.
7. Copy that command and run it as root on the separate Ubuntu/Debian node VPS.

The command is conceptually. The node bootstrap supports Ubuntu 20.04+ on `amd64` or `arm64`; it applies the same Node.js and Docker fallbacks as the panel installer:

```bash
curl -fsSL https://YOUR-SHIRONEX-DOMAIN/node.sh | bash -s -- \
  --panel https://YOUR-SHIRONEX-DOMAIN \
  --node-id NODE_ID \
  --setup-token TEMPORARY_TOKEN \
  --port 6768
```

The setup token is single-use and expires quickly. The installer registers the node, receives a per-node credential, installs Docker and Node.js if required, builds the daemon, creates `shironex-node.service`, and starts it.

Check the node:

```bash
sudo systemctl status shironex-node
sudo journalctl -u shironex-node -f
```

## Multiple nodes

Repeat the same process for Node 2, Node 3, Node 4, and so on. Each node gets a different node ID and credential.

Example:

```text
Panel VPS
  ├── Germany Node 1
  ├── Singapore Node 1
  ├── India Node 1
  └── US Node 1
```

When creating a server, select the desired online node and an available allocation. The panel sends Docker operations to that selected node daemon.

## Node daemon

Installed at:

```text
/opt/shironex-node
/etc/shironex-node/config.json
/var/lib/shironex/servers
```

Service:

```text
shironex-node.service
```

Useful commands:

```bash
sudo systemctl status shironex-node
sudo systemctl restart shironex-node
sudo journalctl -u shironex-node -f
```

Update:

```bash
sudo /opt/shironex-node/update.sh
```

Uninstall the daemon without deleting server data:

```bash
sudo /opt/shironex-node/uninstall.sh
```

## Security model

- Per-node credentials
- Temporary node setup tokens
- Encrypted node secrets on the panel
- Constant-time daemon credential comparison
- Owner/admin-only node management
- Docker access remains on the node daemon
- Server paths are restricted to the configured server directory
- Infrastructure actions can be audited
- Cloudflare credentials stay server-side
- TLS is supported for node connections

Do not expose the Docker socket directly to end users.

## Docker

Each managed Minecraft server is created as its own Docker container on its selected node. The daemon controls lifecycle, logs, resource telemetry and server files.

Install Docker from Docker's official Ubuntu repository for production deployments rather than relying on an unreviewed third-party installer. Docker's current Ubuntu documentation lists supported Ubuntu releases and provides the repository installation procedure. citeturn0search0

## Cloudflare and Minecraft

ShiroNex can manage Cloudflare DNS records and proxy state. Normal Cloudflare HTTP proxying is not treated as a generic Minecraft TCP proxy. For ordinary Minecraft DNS records, use DNS-only unless an appropriate Cloudflare TCP proxy service is actually available to the account.

## Environment variables

The installer creates `.env` and generates missing production secrets. If configuring manually, create `.env` and set production secrets, especially:

```text
JWT_SECRET=
NODE_ENCRYPTION_KEY=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
```

Never commit real secrets.

## Production checklist

- Use HTTPS for the panel.
- Use a valid TLS certificate for node FQDNs.
- Open only the required panel/node ports.
- Keep Docker and Ubuntu updated.
- Back up the ShiroNex data directory and database files.
- Rotate node credentials when a node is compromised.
- Never give normal users Docker socket or host-shell access.

## Production source layout

The repository source distribution contains the panel application under `src/`, static assets under `public/`, the node daemon under `node-daemon/`, and the production entrypoints `install.sh`, `node-install.sh`, and `shironex`. Runtime data, environment files, dependencies, builds, logs, credentials, and archives are excluded by `.gitignore`.

## HTTPS

After the panel is installed and its DNS A record points to the VPS, run:

```bash
sudo shironex ssl
```

The command asks for the domain and ACME email, installs Nginx and Certbot, configures reverse proxying to `127.0.0.1:6767`, enables HTTP-to-HTTPS redirection, adds secure headers, and removes the public firewall rule for the application port. Keep ports 80 and 443 open for certificate issuance and renewal.

## Diagnostics and operations

Use the following commands when checking a deployment:

```bash
sudo shironex diagnostics
sudo shironex backup
sudo shironex logs
sudo shironex update
sudo shironex repair
```

The diagnostics command checks the panel health endpoint, PM2, Docker, the optional node service, disk, memory, and listening ports. Backups are written below `/var/backups/shironex` with restrictive permissions.

## Appearance system

The Settings page now supports immediate theme presets, dark/light/system appearance, accent colors, background effects, and reduced motion. Preferences are applied through document attributes and CSS variables without requiring a reload. The reduced-motion setting also respects the operating system preference.

## Source integration and CI

The repository includes the production installer set (`install.sh`, `node-install.sh`, and `shironex`), the repository `.gitignore`, and a GitHub Actions workflow at `.github/workflows/ci.yml`. CI runs panel dependency installation, TypeScript lint, production build, node-daemon dependency installation, node-daemon build, and shell syntax checks. The installer bootstraps from the real GitHub source tree and does not depend on a source archive.
