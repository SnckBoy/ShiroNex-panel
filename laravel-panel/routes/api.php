<?php

use App\Http\Controllers\NodeController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth')->group(function () {
    Route::post('/nodes/{node}/health', [NodeController::class, 'health']);
});
