<?php

namespace App\Console\Commands;

use App\Models\Allocation;
use App\Models\Node;
use App\Models\Server;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ImportLegacyJson extends Command
{
    protected $signature = 'snck:import-json {path : Path to the legacy .data directory} {--dry-run : Validate and report without writing rows}';
    protected $description = 'Import legacy Snck JSON storage into Laravel tables without deleting source data';

    public function handle(): int
    {
        $root = rtrim($this->argument('path'), DIRECTORY_SEPARATOR);
        if (!is_dir($root)) {
            $this->error("Legacy data directory does not exist: {$root}");
            return self::FAILURE;
        }

        $users = $this->readArray($root, 'users.json');
        $nodes = $this->readArray($root, 'nodes.json');
        $servers = $this->readArray($root, 'servers.json');
        $allocations = $this->readArray($root, 'allocations.json');
        $dryRun = (bool) $this->option('dry-run');
        $counts = ['users' => 0, 'nodes' => 0, 'servers' => 0, 'allocations' => 0, 'skipped' => 0];

        $work = function () use (&$counts, $users, $nodes, $servers, $allocations, $dryRun) {
            foreach ($users as $legacy) {
                $id = $legacy['id'] ?? null;
                $email = strtolower(trim((string) ($legacy['email'] ?? ($legacy['username'] ?? "{$id}@import.invalid"))));
                if (!$id || !$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) { $counts['skipped']++; continue; }
                if (!$dryRun) {
                    User::updateOrCreate(['id' => is_numeric($id) ? (int) $id : null], [
                        'name' => $legacy['name'] ?? $legacy['username'] ?? 'Imported User',
                        'username' => $legacy['username'] ?? null,
                        'email' => $email,
                        'role' => in_array($legacy['role'] ?? 'user', ['owner', 'admin', 'user'], true) ? $legacy['role'] : 'user',
                        'google_id' => $legacy['googleId'] ?? null,
                        'password' => $legacy['password'] ?? Hash::make(Str::random(48)),
                        'password_version' => (int) ($legacy['passwordVersion'] ?? 0),
                    ]);
                }
                $counts['users']++;
            }

            foreach ($nodes as $legacy) {
                $id = (string) ($legacy['id'] ?? '');
                if ($id === '') { $counts['skipped']++; continue; }
                if (!$dryRun) Node::updateOrCreate(['id' => $id], [
                    'name' => $legacy['name'] ?? 'Imported Node',
                    'host' => $legacy['host'] ?? null,
                    'fqdn' => $legacy['fqdn'] ?? $legacy['host'] ?? null,
                    'public_port' => (int) ($legacy['publicPort'] ?? 443),
                    'daemon_port' => (int) ($legacy['daemonPort'] ?? 8080),
                    'sftp_port' => (int) ($legacy['sftpPort'] ?? 2022),
                    'protocol' => $legacy['protocol'] ?? 'https',
                    'behind_proxy' => (bool) ($legacy['behindProxy'] ?? false),
                    'tls_verify' => (bool) ($legacy['tlsVerify'] ?? true),
                    'status' => $legacy['status'] ?? 'offline',
                    'docker_available' => (bool) ($legacy['dockerAvailable'] ?? false),
                    'maintenance' => (bool) ($legacy['maintenance'] ?? false),
                    'server_directory' => $legacy['serverDirectory'] ?? '/var/lib/snck/servers',
                ]);
                $counts['nodes']++;
            }

            foreach ($servers as $legacy) {
                $id = (string) ($legacy['id'] ?? '');
                $nodeId = (string) ($legacy['nodeId'] ?? '');
                if ($id === '' || $nodeId === '' || (!$dryRun && !Node::whereKey($nodeId)->exists())) { $counts['skipped']++; continue; }
                if (!$dryRun) Server::updateOrCreate(['id' => $id], [
                    'node_id' => $nodeId,
                    'name' => $legacy['name'] ?? 'Imported Server',
                    'identifier' => $legacy['identifier'] ?? Str::lower(Str::random(12)),
                    'container_id' => $legacy['containerId'] ?? null,
                    'image' => $legacy['image'] ?? 'itzg/minecraft-server:latest',
                    'version' => $legacy['version'] ?? null,
                    'status' => $legacy['status'] ?? 'offline',
                    'memory_limit' => (int) ($legacy['memoryLimit'] ?? 1024),
                    'cpu_limit' => (int) ($legacy['cpuLimit'] ?? 100),
                    'disk_limit' => (int) ($legacy['diskLimit'] ?? 10240),
                    'startup_command' => $legacy['startupCommand'] ?? null,
                    'environment_json' => $legacy['environment'] ?? null,
                    'suspend' => (bool) ($legacy['suspend'] ?? false),
                ]);
                $counts['servers']++;
            }

            foreach ($allocations as $legacy) {
                $nodeId = (string) ($legacy['nodeId'] ?? '');
                $ip = (string) ($legacy['ip'] ?? '');
                $port = (int) ($legacy['port'] ?? 0);
                if ($nodeId === '' || $ip === '' || $port < 1 || $port > 65535 || (!$dryRun && !Node::whereKey($nodeId)->exists())) { $counts['skipped']++; continue; }
                if (!$dryRun) Allocation::updateOrCreate(['node_id' => $nodeId, 'ip' => $ip, 'port' => $port], [
                    'alias' => $legacy['alias'] ?? null,
                    'assigned_server_id' => $legacy['serverId'] ?? null,
                    'notes' => $legacy['notes'] ?? null,
                ]);
                $counts['allocations']++;
            }
        };

        if ($dryRun) $work(); else DB::transaction($work);
        $this->table(['Resource', 'Imported/Validated'], [
            ['Users', $counts['users']], ['Nodes', $counts['nodes']], ['Servers', $counts['servers']], ['Allocations', $counts['allocations']], ['Skipped', $counts['skipped']],
        ]);
        return self::SUCCESS;
    }

    private function readArray(string $root, string $filename): array
    {
        $path = $root . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($path)) return [];
        $decoded = json_decode((string) file_get_contents($path), true);
        return is_array($decoded) ? array_values($decoded) : [];
    }
}
