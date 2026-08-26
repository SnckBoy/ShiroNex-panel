# ShiroNex Node Administrator Guide: Docker Runtime Unavailability

This guide explains how to diagnose and resolve Docker runtime problems on a ShiroNex node. It is intended for administrators who operate the distributed `node-daemon` service and need to restore server start, stop, restart, console, logs, and telemetry operations.

> **Typical symptom:** The ShiroNex panel reports **Docker runtime unavailable** and advises the administrator to install or start Docker Engine, or to check access to the configured Docker socket.

The ShiroNex node daemon deliberately keeps its authenticated health and heartbeat endpoints available when Docker cannot be reached. A node may therefore appear online while server operations remain unavailable. This distinction is important: **ONLINE means the daemon can authenticate and report; it does not necessarily mean that Docker is healthy.**

## 1. Understand the failure states

The panel normally exposes one of the following conditions. Use the message and HTTP status to choose the correct recovery path.

| Condition | Common evidence | Meaning | First action |
| --- | --- | --- | --- |
| Docker is missing | `docker: command not found`; socket path does not exist | Docker Engine is not installed on the node | Install Docker Engine, then enable and start its service |
| Docker is stopped | `/var/run/docker.sock` exists but `docker info` fails; connection refused | The Docker service is installed but inactive | Start Docker and inspect its service logs |
| Socket permission denied | `permission denied while trying to connect to the Docker daemon socket` | The daemon user cannot read/write the Docker socket | Add the daemon user to the `docker` group and restart its login/service context |
| Wrong socket path | The configured path differs from the active socket | The daemon is pointed at a nonexistent or inaccessible endpoint | Correct `dockerSocket` in the node configuration |
| Docker API or storage failure | Docker is running but `docker info` reports storage, overlay, or API errors | The runtime is unhealthy beyond a simple service restart | Inspect Docker logs, disk space, filesystem, and daemon configuration |
| Panel cannot reach the node | Node is offline in the panel; curl cannot connect to the API port | This is a daemon, network, TLS, firewall, or credential problem rather than a Docker-only problem | Check the node service, listener, address, TLS, and authentication |

A Docker-related operation failure is normally returned as **HTTP 503** with `dockerUnavailable: true`. This indicates that retrying immediately is unlikely to help until Docker or its socket access is repaired.

## 2. Confirm the node daemon service and operating system

SSH into the affected node using an administrative account. Confirm the operating system and daemon process first:

```bash
cat /etc/os-release
uname -a
sudo systemctl status shironex-node --no-pager
sudo ss -ltnp | grep -E ':6768|:YOUR_NODE_PORT'
```

The service name may differ on older installations. If `shironex-node` is not found, locate the installed unit:

```bash
sudo systemctl list-units --type=service --all | grep -i shironex
ps aux | grep '[n]ode.*shironex'
```

If the daemon is not running, inspect its recent log entries:

```bash
sudo journalctl -u shironex-node -n 100 --no-pager
sudo journalctl -u shironex-node -f
```

Do not repeatedly restart the service before reading the logs. A restart can clear useful context, while the underlying cause may be an invalid configuration, a missing directory, a permission problem, or a failed Docker dependency.

## 3. Check whether Docker is installed and running

Run the following commands on the node:

```bash
command -v docker
sudo docker --version
sudo systemctl is-enabled docker
sudo systemctl is-active docker
sudo systemctl status docker --no-pager
```

If Docker is installed but inactive, start it and enable it at boot:

```bash
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

Then validate the Docker API directly:

```bash
sudo docker info
sudo docker ps --all
sudo docker version
```

A healthy Docker installation should return server-side information from `docker info` and should not report a connection, permission, storage-driver, or daemon-startup error. Docker Engine is normally managed as a system service on Linux; use the official installation instructions for the specific Ubuntu or Debian release rather than mixing packages from unrelated distributions [1].

## 4. Install Docker Engine on Ubuntu or Debian

Use the official Docker documentation for the node's exact distribution and release. The supported repository method is preferable to copying an installer from an untrusted source because it configures the Docker package repository and signing key according to Docker's current instructions [1].

After installation, validate the service:

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker info
```

If `hello-world` succeeds but ShiroNex still reports Docker unavailable, the issue is usually one of the following: the ShiroNex service runs under a different user, the daemon points to a nonstandard socket path, the service has not been restarted after a group change, or the node configuration uses HTTPS/HTTP incorrectly.

## 5. Diagnose the Docker socket

The default Linux Docker socket is usually `/var/run/docker.sock`. Check the configured and actual paths:

```bash
sudo ls -l /var/run/docker.sock
sudo ls -l /run/docker.sock
sudo stat /var/run/docker.sock
sudo systemctl show docker --property=ExecStart --no-pager
```

The two common paths may refer to the same socket. Confirm whether they are identical:

```bash
readlink -f /var/run/docker.sock
readlink -f /run/docker.sock
```

If the socket is absent while Docker is supposedly active, inspect Docker's service log:

```bash
sudo journalctl -u docker -n 200 --no-pager
```

Do **not** make the socket world-writable with `chmod 666 /var/run/docker.sock`. That grants every local user broad control over the Docker host and is an unsafe workaround. Docker's post-installation guidance recommends managing non-root socket access through the `docker` group, with the security implication that membership provides root-level control over the host [2].

## 6. Fix socket permissions for the ShiroNex daemon

First identify the user running the daemon:

```bash
sudo systemctl show shironex-node --property=User --property=Group --no-pager
ps -eo user,group,pid,cmd | grep '[n]ode.*shironex'
```

If the service runs as a dedicated user such as `shironex`, add that user to the Docker group:

```bash
sudo groupadd --system docker 2>/dev/null || true
sudo usermod -aG docker shironex
sudo systemctl restart shironex-node
```

If the service runs as another user, substitute that account name. Verify the effective groups used by the service rather than relying only on your interactive shell:

```bash
getent group docker
sudo -u shironex id
sudo -u shironex test -r /var/run/docker.sock && echo readable || echo not-readable
sudo -u shironex docker info
```

A group membership change does not retroactively change the groups of an already-running process. Restart the node daemon after changing group membership. If the service is managed by a long-lived supervisor or a user service, restart that supervisor context as well. The Docker post-installation documentation describes this behavior and the required session refresh [2].

If your security policy does not permit Docker group membership, use a narrowly scoped service design or a root-owned helper rather than weakening socket permissions. Review the risk with the system administrator before changing the service account.

## 7. Verify the ShiroNex node configuration

The node daemon configuration is commonly stored at:

```text
/etc/shironex-node/config.json
```

The path may be overridden with `SHIRONEX_CONFIG`. Inspect the configuration without exposing credentials:

```bash
sudo grep -E '"(nodeId|panelUrl|port|dockerSocket|heartbeatIntervalMs|serverDirectory)"' /etc/shironex-node/config.json
sudo systemctl show shironex-node --property=Environment --no-pager
```

The important Docker setting is the socket path. For a standard Linux Docker installation, it should normally be:

```json
{
  "dockerSocket": "/var/run/docker.sock"
}
```

If the node intentionally uses a nonstandard Docker endpoint, confirm that the endpoint exists and that the daemon's service account can access it. Do not print or paste the node credential, encryption key, TLS private key, or panel secrets into support logs.

After correcting configuration, restart the daemon and inspect its log:

```bash
sudo systemctl daemon-reload
sudo systemctl restart shironex-node
sudo systemctl status shironex-node --no-pager
sudo journalctl -u shironex-node -n 100 --no-pager
```

## 8. Test the node API directly

The following checks confirm whether the panel-facing daemon API is reachable. Replace `NODE_PORT` and `NODE_CREDENTIAL` with the node's configured values. Avoid saving the credential in shell history on shared systems.

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer NODE_CREDENTIAL" \
  http://127.0.0.1:NODE_PORT/v1/health
```

A healthy daemon with an unhealthy Docker runtime should still return JSON containing:

```json
{
  "ok": true,
  "docker": false
}
```

Then test the Docker-specific status path for a known container ID:

```bash
curl --silent --show-error \
  -H "Authorization: Bearer NODE_CREDENTIAL" \
  http://127.0.0.1:NODE_PORT/v1/servers/CONTAINER_ID/status
```

When Docker is unavailable, the expected response is an HTTP 503 JSON response with a friendly `error` string and `dockerUnavailable: true`. The exact socket path in the message is useful when multiple Docker installations or custom runtimes exist.

If `/v1/health` cannot be reached, troubleshoot the daemon listener, firewall, reverse proxy, TLS certificate, node address, and node credential before troubleshooting Docker through the panel.

## 9. Kubernetes and alternative container runtimes

### Compatibility boundary

The current ShiroNex node daemon communicates with a Docker-compatible HTTP API through Dockerode. The default and supported deployment is Docker Engine with an accessible Docker socket. Kubernetes, containerd, and CRI-O are not drop-in replacements for that API. Their native sockets implement the Kubernetes Container Runtime Interface (CRI) or a runtime-specific API, so pointing `dockerSocket` at one of those sockets will not make ShiroNex server operations work.

| Runtime or platform | Direct ShiroNex compatibility | Recommended approach |
| --- | --- | --- |
| Docker Engine | Supported | Use the standard Docker socket or a deliberately configured Docker API endpoint |
| Rootless Docker | Conditional | Configure the node daemon to use the rootless user's socket and run the daemon with the same user context |
| Podman | Experimental, not equivalent to Docker Engine | Use Podman's Docker-compatible API only for a controlled test; keep a dedicated Docker node for production workloads |
| containerd | Not direct | Use a separate Docker Engine node; do not point ShiroNex at the containerd socket |
| CRI-O | Not direct | Use a separate Docker Engine node; do not point ShiroNex at the CRI-O socket |
| Kubernetes | Not a node-daemon runtime replacement | Run ShiroNex on a dedicated Docker node, or build a separate Kubernetes-native integration rather than adapting sockets |

A Kubernetes node can report `Ready` while ShiroNex cannot create or control containers. Kubernetes node readiness verifies the Kubernetes node agent and its configured CRI runtime; it does not provide a Docker API to external clients. Treat Kubernetes health and ShiroNex runtime health as two separate checks.

### Identify the runtime actually installed

Run these commands on the candidate node. Some commands may not exist; that itself is useful evidence.

```bash
command -v docker && docker version
command -v podman && podman info
command -v crictl && sudo crictl info
command -v ctr && sudo ctr version
sudo systemctl is-active docker containerd crio kubelet 2>/dev/null
sudo ss -lx | grep -E 'docker.sock|containerd.sock|crio.sock'
```

For Kubernetes, identify the node runtime from the control plane:

```bash
kubectl get nodes -o wide
kubectl get nodes -o custom-columns='NAME:.metadata.name,RUNTIME:.status.nodeInfo.containerRuntimeVersion'
```

The runtime value may contain `containerd://` or `cri-o://`. That confirms the Kubernetes runtime, but it does not provide a Docker-compatible endpoint for the ShiroNex daemon.

### Kubernetes or containerd node reports healthy but ShiroNex reports Docker unavailable

First confirm Kubernetes independently:

```bash
kubectl get nodes
kubectl describe node NODE_NAME | sed -n '/Conditions:/,/Addresses:/p'
sudo systemctl status kubelet --no-pager
sudo journalctl -u kubelet -n 100 --no-pager
```

Then confirm the CRI runtime independently. `crictl` may require an explicit endpoint configured in `/etc/crictl.yaml`:

```bash
sudo crictl --runtime-endpoint unix:///run/containerd/containerd.sock info
sudo crictl --runtime-endpoint unix:///run/containerd/containerd.sock ps -a
```

For CRI-O, use its socket instead:

```bash
sudo crictl --runtime-endpoint unix:///var/run/crio/crio.sock info
sudo crictl --runtime-endpoint unix:///var/run/crio/crio.sock ps -a
```

If these commands succeed but ShiroNex still reports Docker unavailable, there is no Docker failure to repair. The node is using a runtime that the current ShiroNex daemon does not directly control. Do not change `dockerSocket` to the CRI socket; deploy or register a separate ShiroNex node with Docker Engine instead.

### Recommended Kubernetes architecture

For production, keep Kubernetes and ShiroNex workloads separated unless a dedicated Kubernetes integration has been implemented. Run the panel on its normal host, deploy the node daemon on a dedicated Ubuntu or Debian host with Docker Engine, and register that node using the manual ShiroNex token flow. This preserves Docker API compatibility and avoids having two control planes manage the same containers.

If a Kubernetes cluster must host the panel, run the panel as a Kubernetes workload but expose server execution through one or more external ShiroNex Docker nodes. Do not place the host Docker socket into a panel pod merely to make the API appear available. Mounting a host Docker socket grants broad control over the host and should be treated as a high-risk administrative decision.

### containerd and CRI-O: what not to do

Do not use any of the following as a ShiroNex `dockerSocket` value:

```text
/run/containerd/containerd.sock
/run/k3s/containerd/containerd.sock
/var/run/crio/crio.sock
```

These are not Docker Engine sockets. Dockerode requests such as container creation, inspect, logs, stats, port binding, and exec depend on Docker API semantics that the CRI or runtime-native sockets do not provide. A correct CRI runtime can therefore coexist with a failed ShiroNex node integration.

### Podman Docker-compatible API: controlled experiment only

Podman can expose a Docker-compatible API service, but compatibility varies by Podman version, rootful/rootless mode, image behavior, restart policies, resource limits, logging, and port mappings. Treat this as an experimental path rather than a production guarantee.

For a rootful temporary test, inspect the service and socket first:

```bash
sudo systemctl enable --now podman.socket
sudo systemctl status podman.socket --no-pager
sudo ss -lx | grep podman.sock
```

For a rootless user service, run the service in that user's context:

```bash
systemctl --user enable --now podman.socket
systemctl --user status podman.socket --no-pager
systemctl --user show podman.socket --property=Listen
```

Configure the ShiroNex daemon only after confirming the API endpoint and socket permissions. Then test, in order, a health request, image pull, container creation, start, logs, stats, command execution, stop, and deletion. If any operation fails or telemetry is incomplete, use Docker Engine for that node. Podman's Docker API service is documented as a compatibility interface, not as a promise that every Docker Engine feature behaves identically [5].

### Rootless Docker

Rootless Docker uses a per-user socket rather than the system-wide `/var/run/docker.sock`. Find the active endpoint as the rootless Docker user:

```bash
sudo -iu shironex docker context show
sudo -iu shironex docker context inspect
sudo -iu shironex sh -lc 'echo "${DOCKER_HOST:-unset}"; systemctl --user status docker --no-pager'
```

The socket is commonly under `$XDG_RUNTIME_DIR/docker.sock`, for example `/run/user/1001/docker.sock`. A system service running as root or another account will not automatically inherit the rootless user's `XDG_RUNTIME_DIR`, environment, or permissions. Configure the ShiroNex daemon and its systemd unit to run under the same user and explicitly use the correct socket path.

Validate the exact service context:

```bash
sudo -iu shironex sh -lc 'docker info'
sudo -iu shironex sh -lc 'test -S "$XDG_RUNTIME_DIR/docker.sock" && echo socket-present'
sudo systemctl show shironex-node --property=User --property=Environment --no-pager
```

Rootless mode can impose networking, privileged-port, filesystem, cgroup, and resource-limit differences. Confirm that the Minecraft server ports, memory limits, restart behavior, logs, stats, and command execution all work before assigning production servers to that node. Docker documents rootless setup and its limitations separately from the standard Engine installation [3].

### Kubernetes troubleshooting checklist for a ShiroNex administrator

When a node combines Kubernetes and ShiroNex, use this order:

| Step | Command or check | Interpretation |
| --- | --- | --- |
| 1 | `kubectl get node NODE_NAME` | Confirms Kubernetes control-plane visibility and `Ready` state |
| 2 | `kubectl get node NODE_NAME -o jsonpath='{.status.nodeInfo.containerRuntimeVersion}'` | Identifies containerd, CRI-O, or another Kubernetes runtime |
| 3 | `sudo crictl info` | Confirms CRI connectivity; it does not validate Docker API compatibility |
| 4 | `sudo docker info` | Confirms whether Docker Engine is independently installed and usable |
| 5 | `sudo systemctl status shironex-node` | Confirms daemon process health |
| 6 | ShiroNex `/v1/health` request | Confirms panel-facing authentication and node reachability |
| 7 | ShiroNex server Start test | Confirms actual Docker API operations, image pull, port binding, and container lifecycle |

If steps 1–3 pass but step 4 fails because Docker is absent, the Kubernetes runtime is not a substitute. If step 4 passes but step 6 or 7 fails, troubleshoot the ShiroNex service account, socket path, node configuration, firewall, TLS, or credentials.

## 10. Validate from the ShiroNex panel

After repairing Docker, return to the panel and perform the following sequence:

| Check | Expected result |
| --- | --- |
| Node status | The node remains authenticated and reports current heartbeats |
| Node telemetry | Docker state changes to healthy or available |
| Server page | The server remains visible and no longer shows a Docker runtime warning after refresh |
| Start | The server transitions from offline to starting/online and console logs begin to stream |
| Stop | The server stops without a generic node failure |
| Restart | The server restarts and the console reconnects |
| Logs and stats | Historical logs and telemetry load without raw socket errors |

If the panel still displays the previous error, refresh the node and server views. The panel may retain an offline state until the next authenticated heartbeat or polling interval.

## 11. Incident scenarios and response playbooks

The following scenarios are representative operational incidents. They are written as playbooks rather than as assumptions about the cause of every outage. Capture timestamps, commands, service state, and panel responses before changing configuration so the eventual post-mortem can distinguish the trigger from the recovery action.

### Scenario A: Docker group membership changed, but the node still cannot start servers

**Situation.** Docker was installed successfully and an administrator added the `shironex` service account to the `docker` group. The node heartbeat remains online, but server start returns HTTP 503 with `dockerUnavailable: true` and a socket permission message.

**Likely cause.** The already-running systemd process still has its original supplementary group list. A new login shell sees the group, but the daemon process does not.

**Response.** Confirm the service identity and effective groups, then compare them with the socket owner and group:

```bash
sudo systemctl show shironex-node --property=User --property=Group --no-pager
ps -eo user,group,pid,cmd | grep '[n]ode.*shironex'
ls -l /var/run/docker.sock
sudo systemctl restart shironex-node
sudo journalctl -u shironex-node -n 50 --no-pager
```

Validate access from the daemon's service context rather than from the administrator's shell:

```bash
sudo -u shironex docker info
```

**Recovery verification.** Confirm `/v1/health` reports `docker: true`, run one controlled server start, confirm console output, and then test stop. Record the time of the group change and daemon restart; both are important timeline events.

**Prevention.** Add a post-install validation that checks Docker access as the actual service account. Document that group changes require a process or service restart, and avoid granting unrelated users membership in the Docker group.

### Scenario B: Node reboots and Docker fails to start because the host disk is full

**Situation.** After a maintenance reboot, the node appears online only after the daemon starts, but all container actions fail. `docker.service` is inactive or repeatedly restarting. Docker logs mention failure to write metadata, create a layer, or access its data directory.

**Likely cause.** The Docker data filesystem or its inode table is full. Large Minecraft worlds, image layers, container logs, and backups can exhaust capacity even when the operating system root directory appears healthy.

**Response.** Check both bytes and inodes before deleting anything:

```bash
df -h
df -i
sudo docker system df 2>/dev/null || true
sudo journalctl -u docker -n 200 --no-pager
```

Identify the configured Docker data root without assuming it is `/var/lib/docker`:

```bash
sudo docker info 2>/dev/null | grep -E 'Docker Root Dir|Storage Driver' || true
sudo du -xhd1 /var/lib/docker 2>/dev/null | sort -h
```

Do not remove images, volumes, world files, or container data blindly. Preserve a backup of ShiroNex server data and obtain approval before pruning resources. Once safe space has been recovered, restart Docker and the node daemon.

**Recovery verification.** Require `sudo docker info`, a successful image pull or existing-image inspection, one server start, and a telemetry check. Confirm that the filesystem has a capacity reserve rather than returning to service with only a few megabytes free.

**Prevention.** Monitor Docker data usage, filesystem bytes, and inodes. Define retention for unused images and backups, configure log rotation, and alert before the runtime reaches a critical threshold.

### Scenario C: Docker service is active, but the ShiroNex daemon points to a stale socket path

**Situation.** An administrator moved Docker, changed a rootless context, or migrated the host. `sudo docker info` works, but ShiroNex reports that the configured socket does not exist, such as `/tmp/no-such-docker.sock` or an old user-runtime path.

**Likely cause.** The Docker CLI is using a context or `DOCKER_HOST` value different from the explicit `dockerSocket` configured for the node daemon.

**Response.** Compare the active Docker endpoint with the ShiroNex configuration:

```bash
sudo docker context show
sudo docker context inspect
printf 'DOCKER_HOST=%s\n' "${DOCKER_HOST:-unset}"
sudo grep -E '"dockerSocket"' /etc/shironex-node/config.json
sudo systemctl show shironex-node --property=Environment --no-pager
```

Update the daemon configuration only after confirming the real socket and its permissions. Restart the service and test the node API. Never infer the endpoint from the CLI alone when the daemon runs under a different user.

**Recovery verification.** Confirm the panel error changes from Docker unavailable to normal operation, then exercise start, logs, stats, and stop. A health response alone is insufficient because the daemon can remain online while the configured Docker endpoint is wrong.

**Prevention.** Keep the runtime endpoint in one documented configuration source, include it in node diagnostics without exposing credentials, and validate the endpoint after migrations or changes to Docker contexts.

### Scenario D: Kubernetes node is `Ready`, but ShiroNex cannot create containers

**Situation.** Kubernetes reports a healthy node with `containerd://` or `cri-o://` as its runtime. An administrator points ShiroNex at the runtime socket expecting the node to become compatible. The daemon starts, but server operations fail.

**Likely cause.** Kubernetes uses CRI and the runtime-native socket does not implement the Docker API required by Dockerode. Kubernetes readiness and ShiroNex Docker compatibility are separate health domains.

**Response.** Confirm the Kubernetes and CRI state independently:

```bash
kubectl get node NODE_NAME -o jsonpath='{.status.nodeInfo.containerRuntimeVersion}{"\n"}'
sudo crictl info
sudo systemctl status kubelet containerd crio --no-pager 2>/dev/null
```

Do not point `dockerSocket` at `/run/containerd/containerd.sock`, `/run/k3s/containerd/containerd.sock`, or `/var/run/crio/crio.sock`. The supported recovery is to register a separate ShiroNex node running Docker Engine. If an alternative API adapter is being evaluated, test it as an explicitly experimental integration and do not move production servers until all lifecycle and telemetry operations pass.

**Recovery verification.** Validate a real ShiroNex Docker node through the panel: heartbeat, Docker health, image pull, create, start, logs, stats, command, stop, and delete. Keep Kubernetes health evidence in the incident record, but do not treat it as proof that ShiroNex is recovered.

**Prevention.** Document the runtime compatibility boundary in the node inventory and avoid mixing Kubernetes CRI sockets with Docker API configuration. Use a separate node pool when both orchestration systems are required.

### Scenario E: Rootless Docker works interactively but fails under systemd

**Situation.** `sudo -iu shironex docker info` succeeds, but the `shironex-node` system service reports a missing socket or permission failure.

**Likely cause.** Rootless Docker uses a per-user socket and environment, commonly under `/run/user/UID/docker.sock`. A systemd service may not receive `XDG_RUNTIME_DIR`, the user's Docker context, or the correct user and group.

**Response.** Compare the interactive and service contexts:

```bash
sudo -iu shironex sh -lc 'id; echo "$XDG_RUNTIME_DIR"; docker context show; docker info'
sudo systemctl show shironex-node --property=User --property=Group --property=Environment --no-pager
sudo systemctl cat shironex-node
```

Run the node daemon as the same rootless user and explicitly configure the verified socket path. Confirm that the user service and runtime directory remain available across reboot. If the environment cannot be made reliable, move the workload to a standard Docker Engine node.

**Recovery verification.** Test the full lifecycle, not just `docker info`, because rootless networking, privileged ports, cgroups, resource limits, and filesystem behavior can differ.

**Prevention.** Treat rootless Docker as a conditional deployment. Record the user-runtime socket, user ID, systemd dependencies, and known limitations in the node inventory.

### Scenario F: A panel or daemon update exposes raw socket errors

**Situation.** Operators see `connect ENOENT /var/run/docker.sock` or a generic 500 error instead of the structured Docker diagnostic. Some server pages may load slowly or telemetry requests may remain pending.

**Likely cause.** The panel and node daemon are running mismatched releases, a stale compiled daemon is still active, or an intermediary is rewriting the JSON error response. A telemetry route may also lack an error boundary even though lifecycle routes are normalized.

**Response.** Capture the panel HTTP status, node response body, daemon version, and active process path. Then verify that the running daemon, not merely its source tree, contains the current build:

```bash
sudo systemctl status shironex-node --no-pager
sudo journalctl -u shironex-node -n 100 --no-pager
curl --silent --show-error -H 'Authorization: Bearer NODE_CREDENTIAL' http://127.0.0.1:NODE_PORT/v1/health
```

Restart both sides only according to the deployment procedure, and validate that `/v1/servers/CONTAINER_ID/status`, `/stats`, and `/start` return bounded responses. Preserve the old logs before rotating them.

**Recovery verification.** The panel should display a Docker runtime diagnostic, telemetry should return `available: false` rather than hang when Docker is down, and no raw socket exception should be visible to the operator.

**Prevention.** Pin release versions, include the daemon build identifier in diagnostics, test missing-runtime behavior in CI, and verify every Docker operation path after deployment.

## 14. Incident response and post-mortem templates

### Immediate incident record

Use this short record during the outage. It is intentionally compact so an operator can complete it while restoring service.

| Field | Entry |
| --- | --- |
| Incident ID | `INC-YYYY-MM-DD-NNN` |
| Incident commander | Name or team |
| Affected node(s) | Node IDs, hostnames, region |
| First observed | UTC timestamp |
| Detection source | Panel, alert, customer report, health check |
| Current impact | Servers unable to start, stop, restart, or report telemetry |
| Runtime | Docker Engine, rootless Docker, Podman, containerd, CRI-O, or Kubernetes |
| Last known good | Release, daemon build, configuration change |
| Current status | Investigating, mitigated, monitoring, resolved |

During response, maintain a timestamped event log. Include the first panel symptom, each diagnostic command or service change, the first successful runtime check, and the final panel verification. Separate observations from hypotheses so that a plausible theory is not mistaken for the root cause.

### Full blameless post-mortem template

Copy the following template into the incident record after service is restored:

```markdown
# Post-mortem: [Short incident title]

- Incident ID: INC-YYYY-MM-DD-NNN
- Severity: [SEV-1 / SEV-2 / SEV-3 / SEV-4]
- Status: [Final / Draft]
- Incident commander: [Name or team]
- Authors: [Names or teams]
- Affected node(s): [Node IDs, hostnames, regions]
- Runtime: [Docker Engine / rootless Docker / Podman / Kubernetes / other]
- Start time (UTC): [YYYY-MM-DD HH:MM]
- End time (UTC): [YYYY-MM-DD HH:MM]
- Time to detect: [Duration]
- Time to mitigate: [Duration]
- Time to recover: [Duration]

## Summary

[What happened, in two or three sentences, and how users or operators were affected.]

## Impact

[Number of affected servers, nodes, customers, actions, and duration. State what continued to work, such as authenticated heartbeats or file operations.]

## Detection

[How the incident was detected. Include the first alert, panel message, HTTP status, or customer report.]

## Timeline (UTC)

| Time | Event | Evidence | Owner |
| --- | --- | --- | --- |
| HH:MM | [First symptom] | [Log, alert, screenshot, response] | [Team] |
| HH:MM | [Diagnosis] | [Command or observation] | [Team] |
| HH:MM | [Mitigation] | [Change made] | [Team] |
| HH:MM | [Recovery validation] | [Docker and panel checks] | [Team] |

## Technical analysis

### Trigger

[Immediate event that started the outage, such as reboot, package update, disk exhaustion, socket change, or runtime migration.]

### Root cause

[The specific underlying condition that made the service fail. Avoid describing only the visible symptom.]

### Contributing factors

[Monitoring gaps, undocumented service users, stale binaries, capacity limits, unsafe assumptions about Kubernetes compatibility, or missing runbooks.]

### Why existing safeguards did not prevent or detect it

[Explain gaps in tests, alerts, deployment checks, permissions validation, or capacity planning.]

## Recovery

[Commands, configuration changes, rollback, node replacement, or workload migration used to restore service. Do not include secrets.]

## Validation

[Record results for Docker info, daemon health, node heartbeat, image pull, create, start, logs, stats, command, stop, restart, and delete as applicable.]

## Corrective and preventive actions

| Action | Type | Owner | Priority | Due date | Success measure | Status |
| --- | --- | --- | --- | --- | --- | --- |
| [Action] | Fix / Detection / Process / Documentation | [Team] | P0–P3 | [Date] | [Observable result] | Open |

## Lessons learned

[What helped, what slowed response, and what should change. Keep this blameless and focused on systems and processes.]

## Evidence and links

[Redacted logs, dashboards, deployment IDs, panel node ID, daemon version, and related tickets. Never attach credentials, bearer tokens, private keys, or complete environment files.]
```

### Runtime-specific post-mortem questions

Use the questions below to make the analysis specific to the failing environment.

| Runtime | Questions to answer |
| --- | --- |
| Docker Engine | Was the service active? Did `docker info` work as the ShiroNex service user? Was the socket path correct? Were disk bytes, inodes, image layers, and logs healthy? |
| Rootless Docker | Which user owned the runtime? Was `XDG_RUNTIME_DIR` available to systemd? Did the socket survive reboot? Were networking, cgroups, or privileged-port restrictions involved? |
| Podman compatibility API | Which Podman API version and service mode were used? Did create, port binding, logs, stats, exec, stop, and delete all behave as expected? Why was Docker Engine not used? |
| containerd or CRI-O | Was the runtime used by Kubernetes only? Did anyone incorrectly point ShiroNex at a CRI socket? Should the workload be migrated to a dedicated Docker node? |
| Kubernetes | Was the cluster healthy independently? Was the affected object a Kubernetes workload or a ShiroNex-managed Docker container? Were two control planes attempting to manage the same workload? |

A post-mortem is complete only when the recovery is reproducible, the remaining risk is explicit, and every corrective action has an owner and a measurable success condition. Do not close an incident solely because the panel turned green; verify at least one real server lifecycle operation and the relevant telemetry path.

## 12. Common recovery scenarios

### Docker is installed but `docker info` says permission denied

Confirm the daemon service account, add it to the Docker group, restart the node daemon, and rerun `sudo -u SERVICE_USER docker info`. Do not fix this with `chmod 666` on the socket.

### Docker is installed but the socket is missing

Check `systemctl status docker` and `journalctl -u docker`. Resolve Docker startup errors first. Inspect disk space, inode availability, filesystem mounts, and Docker's data directory if the service exits during startup:

```bash
df -h
df -i
sudo journalctl -u docker -n 200 --no-pager
```

### The node is online but every server action fails

This usually means the daemon's HTTP API and heartbeat path work, while Docker operations fail. Check `/v1/health`, then run `sudo docker info` and verify the daemon's configured socket path and service account.

### The panel reports a raw connection or timeout error instead of Docker guidance

Capture the panel response status and the node daemon log. Confirm that the node daemon and panel are running the same current release. A stale daemon binary, an outdated panel bundle, or a reverse proxy that rewrites JSON error responses can prevent the structured `dockerUnavailable` field from reaching the UI.

### The node daemon starts manually but fails under systemd

Compare the interactive user's environment with the service environment:

```bash
sudo systemctl cat shironex-node
sudo systemctl show shironex-node --property=User --property=Group --property=Environment --no-pager
sudo journalctl -u shironex-node -b --no-pager
```

The systemd service may use a different working directory, user, `PATH`, configuration path, or group list. Correct the unit or environment file, run `sudo systemctl daemon-reload`, and restart the service.

## 13. Safe escalation bundle

If the issue persists, collect diagnostics while redacting credentials and private keys:

```bash
cat /etc/os-release
sudo systemctl status docker --no-pager
sudo systemctl status shironex-node --no-pager
sudo docker --version
sudo docker info
sudo ls -l /var/run/docker.sock
sudo journalctl -u docker -n 200 --no-pager
sudo journalctl -u shironex-node -n 200 --no-pager
sudo df -h
sudo ss -ltnp
```

Also record the panel's node error message, HTTP status, approximate failure time, node daemon version, configured Docker socket path, and whether the failure affects one node or the entire fleet. Never include `credential`, bearer tokens, passwords, encryption keys, TLS private keys, or complete `.env` files in the diagnostic bundle.

## 15. Automated diagnostic CLI

The repository includes `scripts/shironex-node-diagnose.sh`, a read-only triage tool for node administrators. It checks the operating system, ShiroNex daemon state, Docker API availability, configured socket, service-user permissions, disk capacity, alternative runtimes, Kubernetes runtime hints, and optionally the node daemon health endpoint.

The tool does not install packages, restart services, prune Docker data, delete containers, modify configuration, or change permissions. Run it before taking corrective action so the initial state is preserved in the incident record.

### Basic usage

From a checked-out ShiroNex repository, run:

```bash
sudo bash scripts/shironex-node-diagnose.sh
```

To use a nonstandard daemon configuration path:

```bash
sudo bash scripts/shironex-node-diagnose.sh \
  --config /etc/shironex-node/config.json
```

To test the panel-facing node health endpoint, provide the URL and token without printing the token in the report:

```bash
read -rsp 'Node credential: ' SHIRONEX_NODE_TOKEN
export SHIRONEX_NODE_TOKEN
printf '\\n'
sudo --preserve-env=SHIRONEX_NODE_TOKEN bash scripts/shironex-node-diagnose.sh \
  --health-url http://127.0.0.1:6768/v1/health
unset SHIRONEX_NODE_TOKEN
```

If the node daemon runs over HTTPS, use its HTTPS URL and validate the certificate according to the node's deployment policy. Do not use `curl -k` as a permanent fix.

### Read the result

The human-readable report classifies each check as `PASS`, `WARN`, `FAIL`, or `INFO`. A `FAIL` indicates a likely blocking issue, such as a missing Docker CLI or configured socket. A `WARN` indicates a condition that needs review, such as Podman or a Kubernetes CRI runtime being detected, but may not itself block a Docker node. The report includes evidence intended for administrators; it does not include bearer tokens or node credentials.

The command exits with status `1` when one or more blocking failures are found. With `--strict`, it exits with status `2` when there are warnings but no failures. A clean scan exits with status `0`. This makes the tool suitable for a maintenance gate or an incident collection script:

```bash
if ! sudo bash scripts/shironex-node-diagnose.sh --strict; then
  echo 'Review the ShiroNex node diagnostic report before placing workloads here.' >&2
fi
```

For monitoring or support automation, request JSON output:

```bash
sudo bash scripts/shironex-node-diagnose.sh \
  --json > shironex-node-diagnostic.json
```

The JSON contains a summary count and a list of checks with `id`, `status`, `message`, and `evidence` fields. Store the file with the incident record only after reviewing it for hostnames or infrastructure details that your security policy treats as sensitive.

### Recommended triage sequence

Run the default scan first. If `docker-api` or `docker-socket` fails, run `sudo docker info`, inspect `systemctl status docker`, and compare the configured `dockerSocket` with the active endpoint. If `socket-access` fails, identify the systemd service user and correct its group or service context. If `kubernetes`, `cri-runtime`, or `containerd` is reported, verify the runtime with `kubectl` or `crictl`, but do not point ShiroNex at a CRI socket. If `node-health` fails while local Docker checks pass, focus on the daemon listener, URL, TLS, firewall, and credential path.

Run the diagnostic again after remediation. Recovery is not complete until the second report is clean enough for the intended deployment and a real ShiroNex server lifecycle test succeeds. For production nodes, validate at least image pull, create, start, logs, stats, command, stop, restart, and delete as applicable.

### Incident collection example

The following captures both machine-readable output and the command exit status without changing the node:

```bash
OUT="shironex-node-$(hostname)-$(date -u +%Y%m%dT%H%M%SZ).json"
set +e
sudo bash scripts/shironex-node-diagnose.sh --json > "$OUT"
STATUS=$?
set -e
printf 'diagnostic_file=%s exit_status=%s\\n' "$OUT" "$STATUS"
```

Attach the JSON report together with redacted Docker and ShiroNex journal excerpts. Never attach the node credential, bearer token, private key, password, complete environment file, or an unreviewed command history.

## References

[1]: https://docs.docker.com/engine/install/ "Docker Engine installation documentation"

[2]: https://docs.docker.com/engine/install/linux-postinstall/ "Docker Linux post-installation steps and group permissions"

[3]: https://docs.docker.com/engine/security/rootless/ "Docker Rootless mode"

[4]: https://kubernetes.io/docs/setup/production-environment/container-runtimes/ "Kubernetes container runtimes"

[5]: https://docs.podman.io/en/latest/markdown/podman-system-service.1.html "Podman system service and Docker-compatible API"
