<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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

        // Suppress unread DM/bottle notifications for conversations the recipient blocked.
        // Bottle notifications only store a bottle ID, so a blocked bottle thread suppresses
        // notifications for that bottle rather than leaking activity from the blocked thread.
        if (Schema::hasTable('direct_message_blocks')) {
            $query->whereNotExists(function ($blocked) use ($request) {
                $blocked->selectRaw('1')
                    ->from('direct_message_blocks as dmb')
                    ->where(function ($owner) use ($request) {
                        if ($request->user()) $owner->where('dmb.owner_user_id', $request->user()->id);
                        else $owner->where('dmb.owner_guest_key', $request->header('X-Guest-Key'));
                    })
                    ->where(function ($match) {
                        $match->whereColumn('dmb.thread_id', 'notifications.entity_id')
                            ->orWhereRaw("(notifications.type IN ('bottle_reply','bottle_reaction') AND dmb.thread_id LIKE ('bottle-' || notifications.entity_id || '-pair-%'))")
                            ->orWhereRaw("(notifications.type IN ('bottle_reply','bottle_reaction') AND dmb.thread_id = ('bottle-' || notifications.entity_id))");
                    });
            });
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
