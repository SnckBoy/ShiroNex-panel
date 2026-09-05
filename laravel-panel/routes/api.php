<?php

use App\Http\Controllers\AllocationController;
use App\Http\Controllers\NodeController;
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
});
