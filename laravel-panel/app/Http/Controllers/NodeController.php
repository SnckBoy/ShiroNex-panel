<?php

namespace App\Http\Controllers;

use App\Models\Node;
use App\Services\NodeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class NodeController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->adminOnly($request);
        return response()->json(Node::query()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $this->adminOnly($request);
        $data = $request->validate([
            'id' => ['nullable', 'string', 'max:64', 'alpha_dash', 'unique:nodes,id'],
            'name' => ['required', 'string', 'max:120'],
            'host' => ['nullable', 'string', 'max:255'],
            'fqdn' => ['nullable', 'string', 'max:255'],
            'public_port' => ['required', 'integer', 'between:1,65535'],
            'daemon_port' => ['required', 'integer', 'between:1,65535'],
            'sftp_port' => ['required', 'integer', 'between:1,65535'],
            'protocol' => ['required', 'in:http,https'],
            'behind_proxy' => ['boolean'],
            'tls_verify' => ['boolean'],
            'access_client_id' => ['nullable', 'string', 'max:255'],
            'access_client_secret' => ['nullable', 'string', 'max:512'],
            'credential' => ['nullable', 'string', 'max:512'],
        ]);
        $node = Node::create([
            ...$data,
            'id' => $data['id'] ?? Str::lower(Str::random(12)),
            'access_client_secret_encrypted' => isset($data['access_client_secret']) ? Crypt::encryptString($data['access_client_secret']) : null,
            'credential_encrypted' => isset($data['credential']) ? Crypt::encryptString($data['credential']) : null,
        ]);
        return response()->json($node, 201);
    }

    public function update(Request $request, Node $node): JsonResponse
    {
        $this->adminOnly($request);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'host' => ['nullable', 'string', 'max:255'],
            'fqdn' => ['nullable', 'string', 'max:255'],
            'public_port' => ['sometimes', 'integer', 'between:1,65535'],
            'daemon_port' => ['sometimes', 'integer', 'between:1,65535'],
            'sftp_port' => ['sometimes', 'integer', 'between:1,65535'],
            'protocol' => ['sometimes', 'in:http,https'],
            'behind_proxy' => ['sometimes', 'boolean'],
            'tls_verify' => ['sometimes', 'boolean'],
            'maintenance' => ['sometimes', 'boolean'],
            'access_client_id' => ['nullable', 'string', 'max:255'],
            'access_client_secret' => ['nullable', 'string', 'max:512'],
            'credential' => ['nullable', 'string', 'max:512'],
        ]);
        if (array_key_exists('access_client_secret', $data)) $data['access_client_secret_encrypted'] = $data['access_client_secret'] ? Crypt::encryptString($data['access_client_secret']) : null;
        if (array_key_exists('credential', $data)) $data['credential_encrypted'] = $data['credential'] ? Crypt::encryptString($data['credential']) : null;
        unset($data['access_client_secret'], $data['credential']);
        $node->update($data);
        return response()->json($node->fresh());
    }

    public function health(Request $request, Node $node, NodeClient $client): JsonResponse
    {
        $this->adminOnly($request);
        try {
            $payload = $client->health($node);
            $node->forceFill([
                'status' => 'online',
                'docker_available' => (bool) ($payload['dockerAvailable'] ?? $payload['docker_available'] ?? true),
                'last_heartbeat_at' => now(),
            ])->save();
            return response()->json(['online' => true, 'node' => $node->fresh(), 'health' => $payload]);
        } catch (\Throwable $exception) {
            $node->forceFill(['status' => 'offline', 'docker_available' => false])->save();
            return response()->json(['online' => false, 'error' => $exception->getMessage(), 'node' => $node->fresh()], 503);
        }
    }

    public function restart(Request $request, Node $node, NodeClient $client): JsonResponse
    {
        $this->adminOnly($request);
        $response = $client->request($node)->post('/v1/restart');
        if ($response->failed()) return response()->json(['error' => 'Node restart request failed'], 502);
        return response()->json(['success' => true]);
    }

    private function adminOnly(Request $request): void
    {
        abort_unless(in_array($request->user()?->role, ['owner', 'admin'], true), 403);
    }
}
