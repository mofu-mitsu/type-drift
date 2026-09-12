<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\WormController;
use App\Http\Controllers\WormScoreController;

Route::post('/worm/position', [WormController::class, 'position'])
    ->middleware('throttle:1200,1');

Route::get('/worm/ranking', [WormScoreController::class, 'index']);

Route::post('/worm/ranking', [WormScoreController::class, 'store'])
    ->middleware('throttle:30,1');
