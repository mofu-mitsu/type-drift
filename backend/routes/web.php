<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OAuthController;

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
