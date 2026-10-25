<?php

namespace App\\Http\\Controllers;

use App\\Models\\DirectMessage;
use Illuminate\\Http\\Request;

class DirectMessageController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $guestKey ?: ($userId ? 'user:'.$userId : null);

        abort_unless($userId || $lookupKey, 422, 'A guest key is required.');

        $messages = DirectMessage::query()
            ->where(function ($query) use ($userId, $lookupKey) {
                $query->where(function ($participant) use ($userId, $lookupKey) {
                    if ($lookupKey) $participant->where('recipient_guest_key', $lookupKey);
                    if ($userId) $participant->orWhere('recipient_user_id', $userId);
                })->orWhere(function ($participant) use ($userId, $lookupKey) {
                    if ($lookupKey) $participant->where('sender_guest_key', $lookupKey);
                    if ($userId) $participant->orWhere('sender_user_id', $userId);
                });
            })
            ->orderByDesc('created_at')
            ->limit(500)
            ->get()
            ->reverse()
            ->values()
            ->map(function (DirectMessage $message) use ($userId, $lookupKey) {
                $isMine = ($userId && (int) $message->sender_user_id === (int) $userId)
                    || ($lookupKey && $message->sender_guest_key === $lookupKey);

                return [
                    'id' => $message->id,
                    'thread_id' => $message->thread_id,
                    'sender_name' => $message->sender_name,
                    'recipient_name' => $message->recipient_name,
                    'body' => $message->body,
                    'created_at' => $message->created_at,
                    'read' => $message->read_at !== null,
                    'is_mine' => (bool) $isMine,
                    'bottle_id' => $message->bottle_id,
                    'bottle_snippet' => $message->bottle_snippet,
                    'bottle_author' => $message->bottle_author,
                    'bottle_type' => $message->bottle_type,
                ];
            });

        return response()->json(['messages' => $messages]);
    }

    public function markRead(Request $request, DirectMessage $directMessage)
    {
        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $guestKey ?: ($userId ? 'user:'.$userId : null);

        $isRecipient = ($userId && (int) $directMessage->recipient_user_id === (int) $userId)
            || ($lookupKey && $directMessage->recipient_guest_key === $lookupKey);

        abort_unless($isRecipient, 403, 'Only the recipient can mark this message as read.');

        if (!$directMessage->read_at) {
            $directMessage->forceFill(['read_at' => now()])->save();
        }

        return response()->json(['ok' => true, 'read' => true]);
    }
}
