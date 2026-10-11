<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\DirectMessage;
use App\Models\DmRecipient;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function unread(Request $request)
    {
        $query = Notification::whereNull('read_at');
        if ($request->user()) $query->where('user_id', $request->user()->id);
        else $query->where('guest_key', $request->header('X-Guest-Key'));
        $notificationCount = (clone $query)->count();

        // Include incoming unread DMs in the same activity badge count.
        $recipientQuery = DmRecipient::query();
        if ($request->user()) $recipientQuery->where('user_id', $request->user()->id);
        else $recipientQuery->where('guest_key', $request->header('X-Guest-Key'));
        $handle = $recipientQuery->value('handle');
        $dmCount = $handle
            ? DirectMessage::query()->where('recipient_handle', $handle)->whereNull('read_at')->count()
            : 0;

        return response()->json([
            'count' => $notificationCount + $dmCount,
            'notification_count' => $notificationCount,
            'dm_unread_count' => $dmCount,
            'notifications' => $query->latest()->limit(30)->get(),
        ]);
    }

    public function read(Request $request, Notification $notification)
    {
        abort_unless(($request->user() && $notification->user_id === $request->user()->id) || (!$request->user() && $notification->guest_key === $request->header('X-Guest-Key')), 403);
        $notification->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }
}
