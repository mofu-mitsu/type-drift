<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\WormController;
use App\Http\Controllers\WormScoreController;
use App\Http\Controllers\BottleController;
use App\Http\Controllers\ActivityController;
use App\Http\Controllers\ConsultationController;
use App\Http\Controllers\QuestionPromptController;
use App\Http\Controllers\NotificationController;
use Illuminate\Support\Facades\DB;

Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
        return response()->json(['status' => 'ok', 'database' => 'connected']);
    } catch (Throwable $exception) {
        return response()->json(['status' => 'degraded', 'database' => 'unavailable'], 503);
    }
});

Route::get('/bottles', [BottleController::class, 'index']);
Route::post('/bottles', [BottleController::class, 'store']);
Route::delete('/bottles/{bottle}', [BottleController::class, 'destroy']);
Route::post('/bottles/{bottle}/reactions', [BottleController::class, 'react']);
Route::post('/bottles/{bottle}/replies', [BottleController::class, 'reply']);
Route::get('/bottles/{bottle}/replies', [BottleController::class, 'replies']);
Route::post('/replies/{reply}/reactions', [BottleController::class, 'reactToReply']);
Route::post('/bottles/{bottle}/votes', [BottleController::class, 'vote']);
Route::match(['put', 'patch'], '/profile', [BottleController::class, 'profile']);
Route::get('/plaza/messages', [BottleController::class, 'plazaMessages']);
Route::post('/plaza/messages', [BottleController::class, 'plazaMessage']);
Route::post('/feedback', [BottleController::class, 'feedback']);
Route::post('/activity-events', [ActivityController::class, 'event']);
Route::post('/presence/join', [ActivityController::class, 'join']);
Route::post('/presence/heartbeat', [ActivityController::class, 'heartbeat']);
Route::post('/presence/leave', [ActivityController::class, 'leave']);
Route::get('/presence/online', [ActivityController::class, 'online']);
Route::post('/consultations/events', [ConsultationController::class, 'store']);
Route::get('/consultations', [ConsultationController::class, 'index']);
Route::get('/question-prompts', [QuestionPromptController::class, 'index']);
Route::post('/question-prompts', [QuestionPromptController::class, 'store']);
Route::get('/notifications/unread', [NotificationController::class, 'unread']);
Route::post('/notifications/{notification}/read', [NotificationController::class, 'read']);

Route::post('/worm/position', [WormController::class, 'position'])
    ->middleware('throttle:1200,1');

Route::get('/worm/ranking', [WormScoreController::class, 'index']);

Route::post('/worm/ranking', [WormScoreController::class, 'store'])
    ->middleware('throttle:30,1');
