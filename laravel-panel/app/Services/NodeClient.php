<?php

namespace App\Services;

use App\Models\Node;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class NodeClient
{
    public function health(Node $node): array
    {
        $response = $this->request($node)->post('/v1/health');
        if ($response->failed()) {
            throw new RuntimeException("Node health request failed with HTTP {$response->status()}");
        }
        return $response->json() ?: [];
    }

    public function createServer(Node $node, array $payload): array
    {
        $response = $this->request($node)->post('/v1/servers', $payload);
        if ($response->failed()) throw new RuntimeException("Node server creation failed with HTTP {$response->status()}");
        return $response->json() ?: [];
    }

    public function serverAction(Node $node, string $serverId, string $action): array
    {
        if (!in_array($action, ['start', 'stop', 'restart', 'kill'], true)) throw new RuntimeException('Unsupported server action');
        $response = $this->request($node)->post("/v1/servers/{$serverId}/{$action}");
        if ($response->failed()) throw new RuntimeException("Node server {$action} failed with HTTP {$response->status()}");
        return $response->json() ?: [];
    }

    public function serverRequest(Node $node, string $serverId, string $method, string $operation, array $payload = []): array
    {
        $path = "/v1/servers/{$serverId}/{$operation}";
        $response = $this->request($node)->send($method, $path, $method === 'GET' ? ['query' => $payload] : ['json' => $payload]);
        if ($response->failed()) throw new RuntimeException("Node file request failed with HTTP {$response->status()}");
        return $response->json() ?: [];
    }

    public function createBackup(Node $node, string $serverId): array
    {
        return $this->serverRequest($node, $serverId, 'POST', 'backups');
    }

    public function request(Node $node): \Illuminate\Http\Client\PendingRequest
    {
        $scheme = $node->behind_proxy ? ($node->protocol ?: 'https') : ($node->protocol ?: 'http');
        $host = $node->fqdn ?: $node->host;
        if (!$host) throw new RuntimeException('Node has no host or FQDN configured');
        $port = $node->behind_proxy ? $node->public_port : $node->daemon_port;
        $base = rtrim("{$scheme}://{$host}:{$port}", '/');
        $request = Http::baseUrl($base)
            ->acceptJson()
            ->timeout(30)
            ->connectTimeout(10)
            ->withHeaders(['User-Agent' => 'Snck-Laravel-Panel/1.0']);
        if (!$node->tls_verify) $request->withOptions(['verify' => false]);
        $credential = $node->credential_encrypted ? decrypt($node->credential_encrypted) : null;
        if ($credential) $request->withToken($credential);
        if ($node->access_client_id && $node->access_client_secret_encrypted) {
            $request->withHeaders([
                'CF-Access-Client-Id' => $node->access_client_id,
                'CF-Access-Client-Secret' => decrypt($node->access_client_secret_encrypted),
            ]);
        }
        return $request;
    }
}
