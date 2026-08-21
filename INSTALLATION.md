# ShiroNex Panel and Node Installation Guide

**Author:** Manus AI  
**Applies to:** ShiroNex panel VPS and one or more Linux node VPSs  
**Recommended operating system:** Ubuntu 22.04 or 24.04 LTS, 64-bit

## 1. What ShiroNex is

ShiroNex uses a central **panel** and separate **nodes**. The panel provides the web dashboard, login system, API, server records, node records, allocations, and scheduling. A node is another VPS running the ShiroNex Node Daemon. The daemon is the only component that talks to Docker and manages game-server containers on that VPS.

> Easy explanation: the panel is the control room; each node is a worker machine. When you create or start a Minecraft server in the panel, the panel sends the request to the selected node, and that node creates or controls the local Docker container.

| Component | Where it runs | Main responsibility |
|---|---|---|
| Panel | One dedicated panel VPS | Web UI, users, API, node credentials, server metadata |
| Node daemon | Each game-server VPS | Docker containers, logs, files, lifecycle, telemetry |
| Docker | On every node VPS | Runs each Minecraft/proxy server in an isolated container |
| Database files | Panel project `.data/` directory | Stores users, servers, nodes, tokens, settings, and audit data |

A single panel can manage **many nodes**. The panel VPS does not need to be the same VPS as a node. A panel-only VPS is valid, and a separate node-only VPS can connect to it.

## 2. What was fixed in this release

The original archive had a panel TypeScript error in Docker socket detection, and the node daemon could not compile because its Express import was missing. The node daemon also had strict TypeScript errors in Docker pull and lifecycle calls. The project now passes the panel lint check, panel production build, and node-daemon build.

The node setup flow was also incomplete: the dashboard displayed `/node.sh` and downloaded `shironex-node.tar.gz`, but the panel source did not serve those artifacts. The panel now serves both endpoints. The node heartbeat now authenticates with the Authorization header without placing the long-lived node credential in the JSON body.

The included setup flow has these practical capabilities: one-time node setup tokens, per-node credentials, node credential rotation, enable/disable controls, node health and telemetry, Docker lifecycle operations, server logs, server commands, restricted file operations, systemd auto-start, update and uninstall scripts, and support for multiple independent node VPSs.

## 3. Requirements and network layout

Use a domain name for the panel, for example `panel.example.com`. A node may use a domain such as `node-de-1.example.com`. HTTPS is strongly recommended, especially when panel and node traffic crosses the public Internet. Docker’s official Ubuntu guidance lists Ubuntu 22.04 and 24.04 LTS among supported releases and warns that published Docker container ports can bypass ordinary UFW rules, so firewall design must account for Docker networking.[1]

| Host | Suggested open inbound ports | Notes |
|---|---:|---|
| Panel VPS | `22`, `80`, `443` | Keep `6767` private when using a reverse proxy; expose it temporarily only for testing. |
| Node VPS | `22`, node API port such as `6768`, Minecraft allocations | Restrict the node API port to the panel IP where your provider firewall allows it. |

Do not expose `/var/run/docker.sock` to the Internet and do not give normal panel users root or host-shell access. The node daemon needs Docker access locally, which is why it runs as a system service on the node VPS.

## 4. Install the panel on Panel VPS 1

### 4.1 Prepare the VPS

Connect as a sudo-capable user:

```bash
ssh root@PANEL_IP
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl unzip openssl git build-essential
```

The repository’s installer installs Node.js 22 when Node.js is missing or older than version 20. npm’s official guidance recommends using a Node version manager when possible and identifies NodeSource as the recommended installer path on Linux.[2]

### 4.2 Upload and extract the project

Copy `ShiroNex-fixed-improved.zip` to the panel VPS. For example, from your computer:

```bash
scp ShiroNex-fixed-improved.zip root@PANEL_IP:/root/
```

On the panel VPS:

```bash
mkdir -p /root/shironex-upload
unzip -o /root/ShiroNex-fixed-improved.zip -d /root/shironex-upload
cd /root/shironex-upload/ShiroNex
sudo bash install.sh
```

The installer copies the project to `/opt/shironex-panel`, creates `.env` if it does not exist, generates `JWT_SECRET` and `NODE_ENCRYPTION_KEY` when missing, installs npm dependencies, builds the panel, and starts it with PM2 on port `6767` by default.

Check the process:

```bash
pm2 status
pm2 logs shironex-panel --lines 100
curl -I http://127.0.0.1:6767
```

For a temporary test, open `http://PANEL_IP:6767`. For production, put the panel behind HTTPS and use the resulting HTTPS origin when creating nodes.

### 4.3 Configure production secrets

Open the environment file:

```bash
nano /opt/shironex-panel/.env
```

At minimum, verify these values:

```dotenv
NODE_ENV=production
PORT=6767
JWT_SECRET=use-a-long-random-value
NODE_ENCRYPTION_KEY=use-a-different-long-random-value
```

If using Cloudflare features, also set the Cloudflare token and account or zone values required by the panel. Never commit `.env` to Git or send it to another person. After changing `.env`:

```bash
cd /opt/shironex-panel
npm run build
pm2 restart shironex-panel --update-env
```

## 5. Put the panel behind HTTPS

Use an HTTPS reverse proxy such as Nginx or Caddy. The important result is that `https://panel.example.com` forwards to `http://127.0.0.1:6767`. The exact proxy configuration depends on your DNS and certificate provider. Once HTTPS works, use `https://panel.example.com` as the panel URL in every node record.

If you temporarily use the direct port, the node command can use `http://PANEL_IP:6767`, but that is not suitable for long-lived production credentials. Prefer HTTPS before connecting public node VPSs.

## 6. Configure the panel firewall

Ubuntu’s default host firewall tool is UFW, which provides a simple host-based firewall interface.[3] If you are connected over SSH, allow SSH before enabling it:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

If you need temporary direct testing on port `6767`, allow it only temporarily:

```bash
ufw allow 6767/tcp
```

After HTTPS is working, remove that rule if it is no longer needed:

```bash
ufw delete allow 6767/tcp
```

Remember that Docker-published game ports require separate planning because Docker networking can bypass ordinary UFW filtering.[1] Use your VPS provider firewall and Docker-aware rules for production game allocations.

## 7. Create a node from the panel

Log in as an administrator and open **Nodes → Create Node**. Enter the node’s name, hostname or FQDN, public IP, API port, memory, disk, CPU, and server directory. Use port `6768` unless you have a reason to choose another unused port. Enable TLS only when the node endpoint will have a valid certificate and the node daemon is configured for HTTPS.

Create the node. The panel shows a one-time command similar to this:

```bash
curl -fsSL https://panel.example.com/node.sh | bash -s -- \
  --panel https://panel.example.com \
  --node-id NODE_ID \
  --setup-token ONE_TIME_TOKEN \
  --port 6768
```

The token is short-lived and single-use. Copy the command without changing the node ID or token.

## 8. Install a node-only VPS for the first panel

This is the layout you asked about:

```text
Panel VPS 1: https://panel.example.com
    |
    | HTTPS node registration, heartbeat, and control requests
    v
Node VPS 1: node.example.com:6768
    |
    +-- Docker container: Minecraft server A
    +-- Docker container: Minecraft server B
```

On the separate node VPS, connect as root and run the command generated by the panel:

```bash
ssh root@NODE_1_IP
# paste the one-time command from Nodes -> Create Node
```

The node installer performs the following actions: installs prerequisite packages, installs Node.js if needed, installs Docker if Docker is not present, enables Docker, downloads the daemon bundle from the panel, registers the node with the one-time token, saves the returned per-node credential in `/etc/shironex-node/config.json`, builds the daemon, creates `shironex-node.service`, and starts it.

The installer currently uses Docker’s convenience installer when Docker is absent. Docker documents that this method is useful for testing and development and recommends the official apt repository method for production deployments.[1] For a production node, you may install Docker first from Docker’s official Ubuntu repository; the ShiroNex node installer will then detect the existing `docker` command and leave it in place.

Verify the node:

```bash
systemctl status docker --no-pager
systemctl status shironex-node --no-pager
journalctl -u shironex-node -f
```

Return to the panel. The node should receive heartbeats and show online telemetry. If it remains offline, check DNS, the node port, the panel URL, TLS settings, and the node service log.

## 9. Open the node firewall safely

On the node VPS, allow SSH first. Allow the node API port from the panel IP if your firewall supports source restrictions:

```bash
ufw allow OpenSSH
ufw allow from PANEL_IP to any port 6768 proto tcp
ufw enable
ufw status verbose
```

Minecraft allocation ports must be opened according to the ports you assign in the panel. Do not expose the node API port to the whole Internet when a provider firewall or UFW source rule can restrict it to the panel.

## 10. Add more nodes later

To add Node VPS 2, Node VPS 3, or another region, repeat the same workflow. In the panel, create a new node record and use the new one-time command on the new VPS. Each node has its own node ID, credential, Docker daemon, server directory, and heartbeat. A server is placed on the node selected during server creation.

The panel can therefore be arranged like this:

```text
Panel VPS 1
  ├── Node VPS 1: Germany
  ├── Node VPS 2: Singapore
  ├── Node VPS 3: India
  └── Node VPS 4: United States
```

Do not copy the credential from one node to another. If a node credential is exposed, use the panel’s **Rotate** action and restart or reinstall that node with the new credential.

## 11. Important node files and commands

| Path or command | Purpose |
|---|---|
| `/opt/shironex-node` | Installed daemon source and build directory |
| `/etc/shironex-node/config.json` | Node ID, panel URL, credential, port, Docker socket, and data path; mode `600` |
| `/var/lib/shironex/servers` | Node-local server data mounted into containers |
| `shironex-node.service` | systemd service that keeps the daemon running |
| `systemctl restart shironex-node` | Restart the node daemon |
| `journalctl -u shironex-node -f` | Follow node logs |
| `/opt/shironex-node/update.sh` | Reinstall dependencies, rebuild, and restart |
| `/opt/shironex-node/uninstall.sh` | Remove the daemon while preserving server data |

The node daemon exposes authenticated internal endpoints such as `/v1/health`, `/v1/stats`, server lifecycle actions, logs, commands, and restricted file operations. These endpoints are for the panel and should not be treated as a public user API.

## 12. Troubleshooting

If the panel does not start, run `pm2 logs shironex-panel` and confirm that `.env` contains a `JWT_SECRET` with at least 16 characters. If the browser shows a blank page after an update, run `npm run build` again and restart PM2 from `/opt/shironex-panel`.

If a node command returns `Invalid or expired setup token`, create a new node token in the panel and run the newly generated command. Do not reuse a token after a successful registration.

If the node is offline, run `systemctl status shironex-node`, then `journalctl -u shironex-node -n 100 --no-pager`. From the node VPS, test the panel:

```bash
curl -I https://panel.example.com
curl -sS https://panel.example.com/node.sh | head
```

From the panel VPS, test the node endpoint only after authentication is configured. Check that the node FQDN resolves to the correct VPS and that the API port is allowed from the panel. If TLS is enabled in the panel node record, the node must present a certificate whose hostname matches the configured FQDN.

If Docker container creation fails, run:

```bash
docker info
systemctl status docker --no-pager
journalctl -u docker -n 100 --no-pager
```

Also confirm that the requested allocation port is unused, the node has enough RAM and disk, and the selected Docker image can be pulled.

## 13. Backup and update checklist

Back up the panel’s `.data/` directory, `.env`, and any server data that is stored locally on the panel. Back up each node’s `/var/lib/shironex/servers` directory separately. Before updating, take a backup, run the project’s build and lint checks, then restart the relevant service. Never delete node server data when removing only the daemon.

## References

[1]: https://docs.docker.com/engine/install/ubuntu/ "Docker: Install Docker Engine on Ubuntu"

[2]: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm/ "npm: Downloading and installing Node.js and npm"

[3]: https://documentation.ubuntu.com/server/how-to/security/firewalls/ "Ubuntu Server documentation: Firewall"

## 14. HTTPS, diagnostics, and appearance controls

After DNS points to the panel VPS, `sudo shironex ssl` installs Nginx and Certbot, configures a reverse proxy to `127.0.0.1:6767`, enables HTTPS redirection, and removes the public application-port firewall rule. Use `sudo shironex diagnostics` to check panel health, PM2, Docker, the optional node service, disk, memory, and listening ports. Use `sudo shironex backup` before upgrades or configuration changes.

The Settings page provides immediate theme presets, dark/light/system appearance, accent colors, background effects, and reduced motion. These preferences are applied without a page reload and the interface respects `prefers-reduced-motion`.

The clean source layout uses `src/` for application code, `public/` for static assets, `node-daemon/` for the node agent, `scripts/` for supported maintenance scripts, and the root `install.sh`, `node-install.sh`, and `shironex` commands. Do not commit `.env`, `.data/`, `dist/`, `node_modules/`, logs, credentials, or generated archives.
