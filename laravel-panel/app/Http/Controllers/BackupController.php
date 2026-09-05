<?php

namespace App\Http\Controllers;

use App\Models\Backup;
use App\Models\Server;
use App\Services\NodeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class BackupController extends Controller
{
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->staffOnly($request);
        return response()->json($server->backups()->latest()->get());
    }

    public function store(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->staffOnly($request);
        $backup = $server->backups()->create([
            'filename' => 'pending-' . now()->format('YmdHis') . '.tar.gz',
            'status' => 'processing',
            'progress' => 5,
        ]);
        try {
            $result = $client->createBackup($server->node, $server->id);
            $backup->update([
                'filename' => $result['filename'] ?? $backup->filename,
                'size_bytes' => (int) ($result['sizeBytes'] ?? $result['size_bytes'] ?? 0),
                'checksum' => $result['checksum'] ?? null,
                'status' => 'completed',
                'progress' => 100,
                'node_backup_id' => $result['filename'] ?? null,
                'completed_at' => now(),
            ]);
            return response()->json($backup->fresh(), 201);
        } catch (Throwable $exception) {
            $backup->update(['status' => 'failed', 'progress' => 0, 'failed_at' => now()]);
            return response()->json(['error' => $exception->getMessage(), 'backup' => $backup->fresh()], 502);
        }
    }

    private function staffOnly(Request $request): void
    {
        abort_unless(in_array($request->user()?->role, ['owner', 'admin'], true), 403);
    }
}
