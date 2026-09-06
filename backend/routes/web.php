<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OAuthController;
use App\Http\Controllers\BottleController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/api/health', function () {
    try {
        DB::connection()->getPdo();
        return response()->json(['status' => 'ok', 'database' => 'connected']);
    } catch (Throwable $exception) {
        return response()->json(['status' => 'degraded', 'database' => 'unavailable'], 503);
    }
});

Route::get('/api/auth/{provider}/redirect', [OAuthController::class, 'redirect'])->whereIn('provider', ['google', 'x']);
Route::get('/api/auth/{provider}/callback', [OAuthController::class, 'callback'])->whereIn('provider', ['google', 'x']);
Route::get('/api/me', [OAuthController::class, 'me']);
Route::post('/api/logout', [OAuthController::class, 'logout']);
Route::get('/api/bottles', [BottleController::class, 'index']);
Route::post('/api/bottles', [BottleController::class, 'store']);
Route::post('/api/bottles/{bottle}/reactions', [BottleController::class, 'react']);
Route::post('/api/bottles/{bottle}/replies', [BottleController::class, 'reply']);
Route::get('/api/bottles/{bottle}/replies', [BottleController::class, 'replies']);
Route::post('/api/replies/{reply}/reactions', [BottleController::class, 'reactToReply']);
Route::post('/api/bottles/{bottle}/votes', [BottleController::class, 'vote']);
Route::match(['put', 'patch'], '/api/profile', [BottleController::class, 'profile']);
Route::get('/api/plaza/messages', [BottleController::class, 'plazaMessages']);
Route::post('/api/plaza/messages', [BottleController::class, 'plazaMessage']);
Route::post('/api/feedback', [BottleController::class, 'feedback']);
