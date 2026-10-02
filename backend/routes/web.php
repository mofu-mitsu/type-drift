<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\OAuthController;
use App\Http\Controllers\BottleController;
use App\Http\Controllers\ActivityController;
use App\Http\Controllers\ConsultationController;
use App\Http\Controllers\QuestionPromptController;
use App\Http\Controllers\NotificationController;

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
Route::post('/api/activity-events', [ActivityController::class, 'event']);
Route::post('/api/presence/join', [ActivityController::class, 'join']);
Route::post('/api/presence/heartbeat', [ActivityController::class, 'heartbeat']);
Route::post('/api/presence/leave', [ActivityController::class, 'leave']);
Route::get('/api/presence/online', [ActivityController::class, 'online']);
Route::post('/api/consultations/events', [ConsultationController::class, 'store']);
Route::get('/api/question-prompts', [QuestionPromptController::class, 'index']);
Route::post('/api/question-prompts', [QuestionPromptController::class, 'store']);
Route::get('/api/notifications/unread', [NotificationController::class, 'unread']);
Route::post('/api/notifications/{notification}/read', [NotificationController::class, 'read']);
