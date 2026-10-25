<?php

namespace App\Http\Controllers;

use App\Models\DirectMessage;
use App\Models\Bottle;
use Illuminate\Http\Request;

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

    public function store(Request $request)
    {
        $data = $request->validate([
            'bottle_id' => ['required', 'integer', 'exists:bottles,id'],
            'body' => ['required', 'string', 'max:5000'],
        ]);

        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $guestKey ?: ($userId ? 'user:'.$userId : null);
        abort_unless($userId || $lookupKey, 422, 'A guest key is required.');

        $bottle = Bottle::findOrFail($data['bottle_id']);
        $threadId = 'bottle-'.$bottle->id;
        $lastMessage = DirectMessage::query()
            ->where('thread_id', $threadId)
            ->where(function ($query) use ($userId, $lookupKey) {
                $query->where(function ($participant) use ($userId, $lookupKey) {
                    if ($lookupKey) $participant->where('sender_guest_key', $lookupKey);
                    if ($userId) $participant->orWhere('sender_user_id', $userId);
                })->orWhere(function ($participant) use ($userId, $lookupKey) {
                    if ($lookupKey) $participant->where('recipient_guest_key', $lookupKey);
                    if ($userId) $participant->orWhere('recipient_user_id', $userId);
                });
            })
            ->latest('created_at')
            ->first();

        abort_unless($lastMessage, 404, 'This bottle does not have a message thread yet.');

        $isCurrentSender = ($userId && (int) $lastMessage->sender_user_id === (int) $userId)
            || ($lookupKey && $lastMessage->sender_guest_key === $lookupKey);
        $isCurrentRecipient = ($userId && (int) $lastMessage->recipient_user_id === (int) $userId)
            || ($lookupKey && $lastMessage->recipient_guest_key === $lookupKey);
        abort_unless($isCurrentSender || $isCurrentRecipient, 403, 'You are not a participant in this thread.');

        if ($isCurrentSender) {
            $recipientGuestKey = $lastMessage->recipient_guest_key;
            $recipientUserId = $lastMessage->recipient_user_id;
            $senderName = $lastMessage->sender_name;
            $recipientName = $lastMessage->recipient_name;
        } else {
            $recipientGuestKey = $lastMessage->sender_guest_key;
            $recipientUserId = $lastMessage->sender_user_id;
            $senderName = $lastMessage->recipient_name;
            $recipientName = $lastMessage->sender_name;
        }

        $message = DirectMessage::create([
            'sender_guest_key' => $lookupKey,
            'recipient_guest_key' => $recipientGuestKey,
            'sender_user_id' => $userId,
            'recipient_user_id' => $recipientUserId,
            'thread_id' => $threadId,
            'sender_name' => $senderName,
            'recipient_name' => $recipientName,
            'body' => $data['body'],
            'bottle_id' => $bottle->id,
            'bottle_snippet' => $lastMessage->bottle_snippet ?: $bottle->body,
            'bottle_author' => $lastMessage->bottle_author ?: '匿名のボトル主',
            'bottle_type' => $lastMessage->bottle_type ?: '匿名ボトル',
        ]);

        return response()->json(['message' => [
            'id' => $message->id,
            'thread_id' => $message->thread_id,
            'sender_name' => $message->sender_name,
            'recipient_name' => $message->recipient_name,
            'body' => $message->body,
            'created_at' => $message->created_at,
            'read' => false,
            'is_mine' => true,
            'bottle_id' => $message->bottle_id,
            'bottle_snippet' => $message->bottle_snippet,
            'bottle_author' => $message->bottle_author,
            'bottle_type' => $message->bottle_type,
        ]], 201);
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
