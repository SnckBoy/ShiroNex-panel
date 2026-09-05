<?php

namespace App\Http\Controllers;

use App\Models\Server;
use App\Services\NodeClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class ServerFilesController extends Controller
{
    public function list(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'GET', 'files/list', ['path' => $this->path($request->input('path'))]));
    }

    public function read(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'GET', 'files/read', ['path' => $this->requiredPath($request->input('path'))]));
    }

    public function write(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        $data = $request->validate(['path' => ['required', 'string', 'max:1000'], 'content' => ['required', 'string', 'max:80000000']]);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'POST', 'files/write', $data));
    }

    public function mkdir(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        $data = $request->validate(['path' => ['required', 'string', 'max:1000']]);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'POST', 'files/mkdir', ['path' => $data['path']]));
    }

    public function rename(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        $data = $request->validate(['oldPath' => ['required', 'string', 'max:1000'], 'newPath' => ['required', 'string', 'max:1000']]);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'POST', 'files/rename', $data));
    }

    public function delete(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        $data = $request->validate(['paths' => ['required', 'array', 'max:1000'], 'paths.*' => ['string', 'max:1000']]);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'POST', 'files/delete', $data));
    }

    public function command(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        $data = $request->validate(['command' => ['required', 'string', 'max:4000']]);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'POST', 'command', $data));
    }

    public function logs(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'GET', 'logs'));
    }

    public function stats(Request $request, Server $server, NodeClient $client): JsonResponse
    {
        $this->access($request, $server);
        return $this->call(fn () => $client->serverRequest($server->node, $server->id, 'GET', 'stats'));
    }

    private function access(Request $request, Server $server): void
    {
        abort_unless($request->user() && in_array($request->user()->role, ['owner', 'admin'], true), 403);
    }

    private function path(?string $path): string
    {
        $value = trim((string) ($path ?? '.'));
        return $value === '' || $value === '/' ? '.' : ltrim($value, '/');
    }

    private function requiredPath(?string $path): string
    {
        $value = trim((string) $path);
        abort_if($value === '', 422, 'A file path is required.');
        return ltrim($value, '/');
    }

    private function call(\Closure $callback): JsonResponse
    {
        try { return response()->json($callback()); }
        catch (Throwable $exception) { return response()->json(['error' => $exception->getMessage()], 502); }
    }
}
