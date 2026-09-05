<?php

namespace App\Http\Controllers;

use App\Models\Allocation;
use App\Models\Server;
use App\Services\NodeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class ServerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->staffOnly($request);
        return response()->json(Server::with(['node', 'allocations'])->latest()->get());
    }

    public function store(Request $request, NodeClient $client): JsonResponse
    {
        $this->staffOnly($request);
        $data = $request->validate([
            'node_id' => ['required', 'string', 'exists:nodes,id'],
            'name' => ['required', 'string', 'max:120'],
            'image' => ['nullable', 'string', 'max:255'],
            'version' => ['nullable', 'string', 'max:64'],
            'memory_limit' => ['required', 'integer', 'min:128'],
            'cpu_limit' => ['required', 'integer', 'min:1'],
            'disk_limit' => ['required', 'integer', 'min:512'],
            'startup_command' => ['nullable', 'string', 'max:2000'],
            'environment_json' => ['nullable', 'array'],
            'allocation_id' => ['nullable', 'integer', 'exists:allocations,id'],
        ]);
        $allocation = isset($data['allocation_id']) ? Allocation::findOrFail($data['allocation_id']) : null;
        if ($allocation && ($allocation->assigned_server_id || $allocation->node_id !== $data['node_id'])) abort(409, 'Allocation is unavailable for this node.');
        $serverId = (string) Str::lower(Str::random(16));
        $identifier = Str::lower(Str::random(12));
        $server = DB::transaction(function () use ($data, $serverId, $identifier, $allocation) {
            $server = Server::create([
                'id' => $serverId, 'node_id' => $data['node_id'], 'name' => $data['name'], 'identifier' => $identifier,
                'image' => $data['image'] ?? 'itzg/minecraft-server:latest', 'version' => $data['version'] ?? null,
                'status' => 'installing', 'memory_limit' => $data['memory_limit'], 'cpu_limit' => $data['cpu_limit'],
                'disk_limit' => $data['disk_limit'], 'startup_command' => $data['startup_command'] ?? null,
                'environment_json' => $data['environment_json'] ?? [],
            ]);
            if ($allocation) $allocation->update(['assigned_server_id' => $server->id]);
            return $server;
        });
        try {
            $payload = ['id' => $server->id, 'name' => $server->name, 'image' => $server->image, 'version' => $server->version, 'memory' => $server->memory_limit, 'cpu' => $server->cpu_limit, 'disk' => $server->disk_limit, 'startup' => $server->startup_command, 'environment' => $server->environment_json];
            $nodeResult = $client->createServer($server->node, $payload);
            $server->update(['container_id' => $nodeResult['containerId'] ?? $nodeResult['container_id'] ?? null, 'status' => 'offline']);
            return response()->json(['server' => $server->fresh(['node', 'allocations']), 'node' => $nodeResult], 201);
        } catch (Throwable $exception) {
            $server->update(['status' => 'error']);
            return response()->json(['error' => $exception->getMessage(), 'server' => $server->fresh()], 502);
        }
    }

    public function action(Request $request, Server $server, string $action, NodeClient $client): JsonResponse
    {
        $this->staffOnly($request);
        try {
            $result = $client->serverAction($server->node, $server->id, $action);
            $server->update(['status' => $action === 'stop' || $action === 'kill' ? 'offline' : ($action === 'start' ? 'starting' : 'restarting')]);
            return response()->json(['success' => true, 'server' => $server->fresh(), 'node' => $result]);
        } catch (Throwable $exception) {
            return response()->json(['error' => $exception->getMessage()], 502);
        }
    }

    private function staffOnly(Request $request): void
    {
        abort_unless(in_array($request->user()?->role, ['owner', 'admin'], true), 403);
    }
}
