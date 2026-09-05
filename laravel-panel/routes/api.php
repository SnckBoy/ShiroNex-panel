<?php

use App\Http\Controllers\AllocationController;
use App\Http\Controllers\NodeController;
use App\Http\Controllers\ServerController;
use App\Http\Controllers\ServerFilesController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth')->group(function () {
    Route::get('/nodes', [NodeController::class, 'index']);
    Route::post('/nodes', [NodeController::class, 'store']);
    Route::patch('/nodes/{node}', [NodeController::class, 'update']);
    Route::post('/nodes/{node}/health', [NodeController::class, 'health']);
    Route::post('/nodes/{node}/restart', [NodeController::class, 'restart']);

    Route::get('/allocations', [AllocationController::class, 'index']);
    Route::post('/allocations', [AllocationController::class, 'store']);
    Route::post('/allocations/{allocation}/assign', [AllocationController::class, 'assign']);
    Route::post('/allocations/{allocation}/unassign', [AllocationController::class, 'unassign']);

    Route::get('/servers', [ServerController::class, 'index']);
    Route::post('/servers', [ServerController::class, 'store']);
    Route::post('/servers/{server}/{action}', [ServerController::class, 'action'])
        ->whereIn('action', ['start', 'stop', 'restart', 'kill']);

    Route::get('/servers/{server}/files', [ServerFilesController::class, 'list']);
    Route::get('/servers/{server}/files/read', [ServerFilesController::class, 'read']);
    Route::post('/servers/{server}/files/write', [ServerFilesController::class, 'write']);
    Route::post('/servers/{server}/files/mkdir', [ServerFilesController::class, 'mkdir']);
    Route::post('/servers/{server}/files/rename', [ServerFilesController::class, 'rename']);
    Route::post('/servers/{server}/files/delete', [ServerFilesController::class, 'delete']);
    Route::post('/servers/{server}/command', [ServerFilesController::class, 'command']);
    Route::get('/servers/{server}/logs', [ServerFilesController::class, 'logs']);
    Route::get('/servers/{server}/stats', [ServerFilesController::class, 'stats']);
});
