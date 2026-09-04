<?php

namespace App\Http\Controllers;

use App\Models\Node;
use App\Services\NodeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NodeController extends Controller
{
    public function health(Request $request, Node $node, NodeClient $client): JsonResponse
    {
        abort_unless($request->user()?->role === 'owner' || $request->user()?->role === 'admin', 403);
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
}
