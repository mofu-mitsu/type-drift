<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function unread(Request $request)
    {
        $query = Notification::whereNull('read_at');
        if ($request->user()) $query->where('user_id', $request->user()->id);
        else $query->where('guest_key', $request->header('X-Guest-Key'));
        return response()->json(['count' => $query->count(), 'notifications' => $query->latest()->limit(30)->get()]);
    }

    public function read(Request $request, Notification $notification)
    {
        abort_unless(($request->user() && $notification->user_id === $request->user()->id) || (!$request->user() && $notification->guest_key === $request->header('X-Guest-Key')), 403);
        $notification->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }
}
