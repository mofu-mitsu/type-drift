<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function unread(Request $request)
    {
        $query = Notification::query()->whereNull('read_at');
        if ($request->user()) {
            $query->where('user_id', $request->user()->id);
        } else {
            $guestKey = $request->header('X-Guest-Key');
            if (!$guestKey) return response()->json(['count' => 0, 'counts' => [], 'notifications' => []]);
            $query->whereNull('user_id')->where('guest_key', $guestKey);
        }

        $counts = (clone $query)
            ->selectRaw('type, COUNT(*) AS total')
            ->groupBy('type')
            ->pluck('total', 'type');

        return response()->json([
            'count' => (clone $query)->count(),
            'counts' => $counts,
            'notifications' => $query->latest()->limit(50)->get(),
        ]);
    }

    public function readAll(Request $request)
    {
        $data = $request->validate(['types' => ['sometimes', 'array'], 'types.*' => ['string', 'max:60']]);
        $query = Notification::query()->whereNull('read_at');
        if ($request->user()) {
            $query->where('user_id', $request->user()->id);
        } else {
            $guestKey = $request->header('X-Guest-Key');
            if (!$guestKey) return response()->json(['ok' => false, 'message' => 'missing_guest_key'], 422);
            $query->whereNull('user_id')->where('guest_key', $guestKey);
        }
        if (!empty($data['types'])) $query->whereIn('type', $data['types']);
        $updated = $query->update(['read_at' => now()]);
        return response()->json(['ok' => true, 'updated' => $updated]);
    }

    public function read(Request $request, Notification $notification)
    {
        $guestKey = $request->header('X-Guest-Key');
        if (!$request->user() && !$guestKey) return response()->json(['ok' => false, 'message' => 'missing_guest_key'], 422);
        $ownsNotification = $request->user()
            ? $notification->user_id === $request->user()->id
            : ($notification->user_id === null && hash_equals((string) $notification->guest_key, $guestKey));
        abort_unless($ownsNotification, 403);
        $notification->update(['read_at' => now()]);
        return response()->json(['ok' => true]);
    }


}
