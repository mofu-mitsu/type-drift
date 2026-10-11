<?php

namespace App\Http\Controllers;

use App\Models\DirectMessage;
use App\Models\DmRecipient;
use App\Models\Bottle;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DirectMessageController extends Controller
{
    public function identity(Request $request)
    {
        $recipient = $this->recipientFor($request);
        return response()->json(['handle' => $recipient->handle]);
    }

    public function index(Request $request)
    {
        $recipient = $this->recipientFor($request);
        $messages = DirectMessage::query()
            ->where(fn ($query) => $query->where('sender_handle', $recipient->handle)->orWhere('recipient_handle', $recipient->handle))
            ->orderBy('created_at')
            ->limit(500)
            ->get()
            ->map(fn (DirectMessage $message) => $this->present($message, $recipient->handle))
            ->values();

        return response()->json(['messages' => $messages]);
    }

    public function store(Request $request)
    {
        $sender = $this->recipientFor($request);
        $data = $request->validate([
            'recipient_handle' => ['nullable', 'uuid', 'exists:dm_recipients,handle', 'required_without:bottle_id'],
            'bottle_id' => ['nullable', 'integer', 'exists:bottles,id', 'required_without:recipient_handle'],
            'body' => ['required', 'string', 'max:5000'],
            'sender_name' => ['nullable', 'string', 'max:80'],
            'recipient_name' => ['nullable', 'string', 'max:80'],
            'sender_emoji' => ['nullable', 'string', 'max:16'],
            'recipient_emoji' => ['nullable', 'string', 'max:16'],
        ]);

        $bottle = null;
        if (!empty($data['bottle_id'])) {
            $bottle = Bottle::query()->findOrFail($data['bottle_id']);
            abort_if(!$bottle->user_id && !$bottle->guest_key, 422, 'このボトルの投稿者はDMを受信できません。');
            if ($bottle->user_id) {
                $target = DmRecipient::query()->firstOrCreate(
                    ['user_id' => $bottle->user_id],
                    ['handle' => (string) Str::uuid()],
                );
            } else {
                $target = DmRecipient::query()->firstOrCreate(
                    ['guest_key' => $bottle->guest_key],
                    ['handle' => (string) Str::uuid()],
                );
            }
        } else {
            $target = DmRecipient::query()->where('handle', $data['recipient_handle'])->firstOrFail();
        }

        abort_if($target->handle === $sender->handle, 422, '自分宛てには送信できません。');

        $message = DirectMessage::create([
            'sender_handle' => $sender->handle,
            'recipient_handle' => $target->handle,
            'sender_user_id' => $sender->user_id,
            'recipient_user_id' => $target->user_id,
            'sender_name' => $data['sender_name'] ?? ($request->user()?->name ?: '匿名の誰か'),
            'recipient_name' => $data['recipient_name'] ?? ($bottle ? ('匿名の'.($bottle->mbti ?: $bottle->socionics ?: '誰か')) : '匿名の誰か'),
            'sender_emoji' => $data['sender_emoji'] ?? '◌',
            'recipient_emoji' => $data['recipient_emoji'] ?? '◌',
            'body' => trim($data['body']),
            'bottle_id' => $bottle?->id,
        ]);

        return response()->json(['message' => $this->present($message, $sender->handle)], 201);
    }

    public function markThreadRead(Request $request, string $handle)
    {
        $recipient = $this->recipientFor($request);
        abort_unless(DmRecipient::query()->where('handle', $handle)->exists(), 404);

        DirectMessage::query()
            ->where('sender_handle', $handle)
            ->where('recipient_handle', $recipient->handle)
            ->whereNull('read_at')
            ->update(['read_at' => now(), 'updated_at' => now()]);

        return response()->json(['ok' => true]);
    }

    private function recipientFor(Request $request): DmRecipient
    {
        $user = $request->user();
        if ($user) {
            return DmRecipient::query()->firstOrCreate(
                ['user_id' => $user->id],
                ['handle' => (string) Str::uuid()],
            );
        }

        $guestKey = trim((string) $request->header('X-Guest-Key', ''));
        abort_if($guestKey === '', 422, 'X-Guest-Key is required for guest messaging.');

        return DmRecipient::query()->firstOrCreate(
            ['guest_key' => $guestKey],
            ['handle' => (string) Str::uuid()],
        );
    }

    private function present(DirectMessage $message, string $currentHandle): array
    {
        $isMine = $message->sender_handle === $currentHandle;
        return [
            'id' => $message->id,
            'thread_id' => $isMine ? $message->recipient_handle : $message->sender_handle,
            'sender_handle' => $message->sender_handle,
            'recipient_handle' => $message->recipient_handle,
            'sender' => $message->sender_name,
            'recipient' => $message->recipient_name,
            'sender_emoji' => $message->sender_emoji,
            'recipient_emoji' => $message->recipient_emoji,
            'target_emoji' => $isMine ? $message->recipient_emoji : $message->sender_emoji,
            'target_type' => '広場の住人',
            'body' => $message->body,
            'created_at' => $message->created_at ? $message->created_at->getTimestamp() * 1000 : null,
            'read' => $isMine || $message->read_at !== null,
            'read_at' => $message->read_at,
            'is_mine' => $isMine,
            'bottle_id' => $message->bottle_id,
        ];
    }
}
