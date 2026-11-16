<?php

namespace App\Http\Controllers;

use App\Models\DirectMessage;
use App\Models\Bottle;
use App\Models\Notification;
use App\Models\Profile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DirectMessageController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $userId ? 'user:'.$userId : $guestKey;

        abort_unless($userId || $lookupKey, 422, 'A guest key is required.');

        // Ensure the server-side block list exists for Laravel-backed requests too.
        if (!Schema::hasTable('direct_message_blocks')) {
            Schema::create('direct_message_blocks', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('owner_user_id')->nullable()->index();
                $table->string('owner_guest_key')->nullable()->index();
                $table->string('thread_id', 200);
                $table->string('target_name', 120)->default('相手');
                $table->string('target_emoji', 20)->default('◌');
                $table->timestamps();
            });
        }

        // The reply table is the source of truth for NPC text. Deliver already-generated
        // replies to the bottle owner's inbox idempotently; never call the AI generator here.
        $npcReplies = DB::table('replies as r')
            ->join('bottles as b', 'b.id', '=', 'r.bottle_id')
            ->whereIn('r.guest_key', ['ai:darling', 'ai:lsi-worm'])
            ->whereNull('b.deleted_at')
            // A reply-disabled bottle must never be backfilled into a DM or trigger a DM notification.
            ->where(function ($q) { $q->whereNull('b.allow_replies')->orWhere('b.allow_replies', true); })
            ->where(function ($owner) use ($userId, $guestKey) {
                if ($userId) $owner->where('b.user_id', $userId);
                if ($guestKey) $owner->orWhere('b.guest_key', $guestKey);
            })
            ->select('r.id as reply_id', 'r.bottle_id', 'r.guest_key as npc_key', 'r.body', 'r.created_at as reply_created_at',
                'b.user_id as bottle_user_id', 'b.guest_key as bottle_guest_key', 'b.body as bottle_body',
                'b.mbti', 'b.socionics', 'b.enneagram', 'b.other_type', 'b.ai_character')
            ->orderBy('r.created_at')
            ->limit(300)->get();
        foreach ($npcReplies as $reply) {
            $npcKey = (string) $reply->npc_key;
            $character = $npcKey === 'ai:darling' ? 'ダーリンちゃん' : 'LSI芋虫';
            $recipientKey = $userId ? 'user:'.$userId : (string) $guestKey;
            $participants = array_values(array_unique(collect([$npcKey, $recipientKey])->all()));
            sort($participants, SORT_STRING);
            // A bottle-origin NPC reply belongs to that bottle's thread, not the generic NPC DM.
            $threadId = 'bottle-'.$reply->bottle_id.'-npc-pair-'.implode('--', $participants);
            $blocked = DB::table('direct_message_blocks')
                ->where(function ($q) use ($userId, $guestKey) {
                    if ($userId) $q->where('owner_user_id', $userId);
                    else $q->where('owner_guest_key', $guestKey);
                })
                ->where(function ($q) use ($threadId, $npcKey, $character) {
                    $q->whereIn('thread_id', [$threadId, $npcKey, 'ai:darling', 'ai:lsi-worm'])
                      ->orWhere('target_name', $character);
                })->exists();
            if ($blocked) continue;
            $exists = DirectMessage::query()
                ->where('sender_guest_key', $npcKey)
                ->where('recipient_guest_key', $recipientKey)
                ->where('bottle_id', $reply->bottle_id)
                ->where('body', $reply->body)->exists();
            if ($exists) continue;
            $recipientProfile = $this->profileSnapshot($userId, $recipientKey);
            DirectMessage::create([
                'sender_guest_key' => $npcKey,
                'recipient_guest_key' => $recipientKey,
                'sender_user_id' => null,
                'recipient_user_id' => $userId,
                'thread_id' => $threadId,
                'sender_name' => $character,
                'recipient_name' => 'あなた',
                'body' => $reply->body,
                'bottle_id' => $reply->bottle_id,
                'bottle_snippet' => mb_substr((string) $reply->bottle_body, 0, 500),
                'bottle_author' => $character,
                'bottle_type' => (string) ($reply->ai_character ?: implode(' · ', array_filter([$reply->socionics, $reply->enneagram, $reply->mbti, $reply->other_type])) ?: 'ボトルへの返信'),
                'sender_profile' => null,
                'recipient_profile' => $recipientProfile,
                'created_at' => $reply->reply_created_at,
            ]);
        }

        $messages = DirectMessage::query()
            // Do not surface legacy NPC DM rows created from bottles whose replies are disabled.
            ->whereNotExists(function ($disabled) {
                $disabled->selectRaw('1')
                    ->from('bottles as disabled_bottle')
                    ->whereColumn('disabled_bottle.id', 'direct_messages.bottle_id')
                    ->where('disabled_bottle.allow_replies', false)
                    ->where(function ($npc) {
                        $npc->whereIn('direct_messages.sender_guest_key', ['ai:darling', 'ai:lsi-worm'])
                            ->orWhereIn('direct_messages.recipient_guest_key', ['ai:darling', 'ai:lsi-worm']);
                    });
            })
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
                    'thread_id' => (function () use ($message) {
                        $participants = array_values(array_unique(array_filter([
                            $message->sender_user_id ? 'user:'.$message->sender_user_id : $message->sender_guest_key,
                            $message->recipient_user_id ? 'user:'.$message->recipient_user_id : $message->recipient_guest_key,
                        ])));
                        sort($participants, SORT_STRING);
                        $isNpcMessage = str_starts_with((string) $message->sender_guest_key, 'ai:')
                            || str_starts_with((string) $message->recipient_guest_key, 'ai:');
                        if ($isNpcMessage && count($participants) === 2) {
                            return $message->bottle_id
                                ? 'bottle-'.$message->bottle_id.'-npc-pair-'.implode('--', $participants)
                                : 'dm-pair-'.implode('--', $participants);
                        }
                        if ($message->bottle_id && count($participants) === 2) return 'bottle-'.$message->bottle_id.'-pair-'.implode('--', $participants);
                        return $message->thread_id;
                    })(),
                    'sender_guest_key' => $message->sender_guest_key,
                    'recipient_guest_key' => $message->recipient_guest_key,
                    // Older Laravel rows sometimes saved the generated NPC text under the bottle owner's identity.
                    // Match the canonical replies row so the client can restore the NPC identity without merging users.
                    'matched_npc_key' => $message->bottle_id ? DB::table('replies')->where('bottle_id', $message->bottle_id)->where('body', $message->body)->whereIn('guest_key', ['ai:darling', 'ai:lsi-worm'])->orderByDesc('created_at')->value('guest_key') : null,
                    'sender_user_id' => $message->sender_user_id,
                    'recipient_user_id' => $message->recipient_user_id,
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
                    'sender_identity' => $this->senderIdentity($message),
                    'sender_profile' => $message->sender_profile ?: $this->profileSnapshot($message->sender_user_id, $message->sender_guest_key),
                    'recipient_profile' => $message->recipient_profile ?: $this->profileSnapshot($message->recipient_user_id, $message->recipient_guest_key),
                ];
            });

        $blockedThreads = DB::table('direct_message_blocks')
            ->where(function ($query) use ($userId, $guestKey) {
                if ($userId) $query->where('owner_user_id', $userId);
                else $query->where('owner_guest_key', $guestKey);
            })
            ->select('thread_id', 'target_name', 'target_emoji', 'created_at')
            ->get();

        return response()->json(['messages' => $messages, 'blocked_threads' => $blockedThreads]);
    }

    public function store(Request $request)
    {
        $action = $request->input('action');
        if (in_array($action, ['block_thread', 'unblock_thread'], true)) {
            $userId = $request->user()?->id;
            $guestKey = $request->header('X-Guest-Key');
            $lookupKey = $userId ? 'user:'.$userId : $guestKey;
            abort_unless($userId || $lookupKey, 422, 'A guest key is required.');
            if (!Schema::hasTable('direct_message_blocks')) {
                Schema::create('direct_message_blocks', function ($table) {
                    $table->bigIncrements('id');
                    $table->unsignedBigInteger('owner_user_id')->nullable()->index();
                    $table->string('owner_guest_key')->nullable()->index();
                    $table->string('thread_id', 200);
                    $table->string('target_name', 120)->default('相手');
                    $table->string('target_emoji', 20)->default('◌');
                    $table->timestamps();
                });
            }
            $threadId = substr((string) $request->input('thread_id', ''), 0, 200);
            abort_if($threadId === '', 422, 'A thread ID is required.');
            $ownerQuery = DB::table('direct_message_blocks')->where('thread_id', $threadId);
            if ($userId) $ownerQuery->where('owner_user_id', $userId);
            else $ownerQuery->where('owner_guest_key', $guestKey);
            if ($action === 'block_thread') {
                if (!$ownerQuery->exists()) {
                    DB::table('direct_message_blocks')->insert([
                        'owner_user_id' => $userId,
                        'owner_guest_key' => $userId ? null : $guestKey,
                        'thread_id' => $threadId,
                        'target_name' => substr((string) $request->input('target_name', '相手'), 0, 120),
                        'target_emoji' => substr((string) $request->input('target_emoji', '◌'), 0, 20),
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                }
            } else {
                $ownerQuery->delete();
            }
            return response()->json(['ok' => true, 'action' => $action]);
        }

        // Explicit NPC DM persistence. The Next.js route supports these payloads too, but Render/Laravel
        // must use the same participant IDs and thread namespace when apiFetch targets the backend directly.
        $payload = $request->all();
        if (($payload['npc_message'] ?? false) === true || ($payload['ai_reply'] ?? false) === true) {
            $userId = $request->user()?->id;
            $guestKey = $request->header('X-Guest-Key');
            $lookupKey = $userId ? 'user:'.$userId : $guestKey;
            abort_unless($userId || $lookupKey, 422, 'A guest key is required.');
            $character = (string) ($payload['ai_character'] ?? $payload['target_name'] ?? '');
            $npcKey = str_contains($character, 'ダーリン') || stripos($character, 'darling') !== false || str_contains($character, '🥺')
                ? 'ai:darling'
                : (str_contains($character, '芋虫') || stripos($character, 'worm') !== false || str_contains($character, '🐛') ? 'ai:lsi-worm' : '');
            abort_if($npcKey === '', 422, 'Unknown AI character.');
            $body = trim((string) ($payload['body'] ?? ''));
            abort_if($body === '' || mb_strlen($body) > 10000, 422, 'Invalid message body.');
            $bottleId = isset($payload['bottle_id']) && is_numeric($payload['bottle_id']) ? (int) $payload['bottle_id'] : null;
            $bottleMode = ($payload['conversation_mode'] ?? null) === 'bottle' && $bottleId !== null;
            if ($bottleId !== null) abort_unless(Bottle::whereKey($bottleId)->exists(), 404, 'Bottle not found.');
            $participants = array_values(array_unique(array_filter([$lookupKey, $npcKey])));
            sort($participants, SORT_STRING);
            // ボトルから始まったNPC会話はボトルごとに分け、通常DMだけ参加者ペアでまとめる。
            $threadId = $bottleMode
                ? 'bottle-'.$bottleId.'-npc-pair-'.implode('--', $participants)
                : 'dm-pair-'.implode('--', $participants);
            if (($payload['ai_reply'] ?? false) === true) {
                $existing = DirectMessage::query()->where('sender_guest_key', $npcKey)->where('recipient_guest_key', $lookupKey)
                    ->where('thread_id', $threadId)->where('body', $body)
                    ->when($bottleMode, fn ($q) => $q->where('bottle_id', $bottleId), fn ($q) => $q->whereNull('bottle_id'))
                    ->first();
                if ($existing) return response()->json(['ok' => true, 'existing' => true, 'message' => $existing]);
                $senderKey = $npcKey;
                $recipientKey = $lookupKey;
                $senderName = $npcKey === 'ai:darling' ? 'ダーリンちゃん' : 'LSI芋虫';
                $recipientName = (string) ($payload['recipient_name'] ?? 'あなた');
                $senderUserId = null;
                $recipientUserId = $userId;
                $senderProfile = null;
                $recipientProfile = is_array($payload['recipient_profile'] ?? null) ? $payload['recipient_profile'] : null;
            } else {
                $senderKey = $lookupKey;
                $recipientKey = $npcKey;
                $senderName = (string) ($payload['sender_name'] ?? 'あなた');
                $recipientName = $npcKey === 'ai:darling' ? 'ダーリンちゃん' : 'LSI芋虫';
                $senderUserId = $userId;
                $recipientUserId = null;
                $senderProfile = is_array($payload['sender_profile'] ?? null) ? $payload['sender_profile'] : null;
                $recipientProfile = null;
            }
            $bottle = $bottleMode ? Bottle::find($bottleId) : null;
            $message = DirectMessage::create([
                'sender_guest_key' => $senderKey, 'recipient_guest_key' => $recipientKey,
                'sender_user_id' => $senderUserId, 'recipient_user_id' => $recipientUserId,
                'thread_id' => $threadId, 'sender_name' => $senderName, 'recipient_name' => $recipientName,
                'body' => $body, 'bottle_id' => $bottleMode ? $bottleId : null,
                'bottle_snippet' => $bottle ? mb_substr((string) $bottle->body, 0, 500) : ($payload['bottle_snippet'] ?? null),
                'bottle_author' => $bottle ? ($npcKey === 'ai:darling' ? 'ダーリンちゃん' : 'LSI芋虫') : null,
                'bottle_type' => $bottle ? (string) ($payload['bottle_type'] ?? implode(' · ', array_filter([$bottle->mbti, $bottle->socionics, $bottle->enneagram, $bottle->other_type]))) : null,
                'sender_profile' => $senderProfile, 'recipient_profile' => $recipientProfile,
            ]);
            return response()->json(['ok' => true, 'message' => [
                'id' => $message->id, 'thread_id' => $message->thread_id, 'sender_name' => $message->sender_name,
                'recipient_name' => $message->recipient_name, 'body' => $message->body, 'created_at' => $message->created_at,
                'read' => false, 'is_mine' => ($payload['npc_message'] ?? false) === true,
                'bottle_id' => $message->bottle_id, 'bottle_snippet' => $message->bottle_snippet,
                'bottle_author' => $message->bottle_author, 'bottle_type' => $message->bottle_type,
            ]], 201);
        }

        $data = $request->validate([
            'bottle_id' => ['required', 'integer', 'exists:bottles,id'],
            'body' => ['required', 'string', 'max:5000'],
            'sender_profile' => ['sometimes', 'array'],
            'recipient_profile' => ['sometimes', 'array'],
        ]);

        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $userId ? 'user:'.$userId : $guestKey;
        abort_unless($userId || $lookupKey, 422, 'A guest key is required.');

        $bottle = Bottle::findOrFail($data['bottle_id']);
        $senderIdentity = $userId ? 'user:'.$userId : $guestKey;
        $ownerIdentity = $bottle->user_id ? 'user:'.$bottle->user_id : $bottle->guest_key;
        $participants = array_values(array_unique(array_filter([$senderIdentity, $ownerIdentity])));
        sort($participants, SORT_STRING);
        $isNpcThread = str_starts_with((string) $ownerIdentity, 'ai:');
        $threadId = 'bottle-'.$bottle->id.($isNpcThread ? '-npc-pair-' : '-pair-').implode('--', $participants);
        // Match the exact bottle + two participant identities, not the legacy thread_id.
        // Old rows used only "bottle-{id}", which made B and C appear to share one thread.
        $lastMessage = DirectMessage::query()
            ->where('bottle_id', $bottle->id)
            ->where(function ($query) use ($senderIdentity, $ownerIdentity) {
                $query->where(function ($pair) use ($senderIdentity, $ownerIdentity) {
                    $pair->whereRaw("COALESCE(CASE WHEN sender_user_id IS NOT NULL THEN 'user:' || sender_user_id::text ELSE sender_guest_key END, '') = ?", [$senderIdentity])
                        ->whereRaw("COALESCE(CASE WHEN recipient_user_id IS NOT NULL THEN 'user:' || recipient_user_id::text ELSE recipient_guest_key END, '') = ?", [$ownerIdentity]);
                })->orWhere(function ($pair) use ($senderIdentity, $ownerIdentity) {
                    $pair->whereRaw("COALESCE(CASE WHEN sender_user_id IS NOT NULL THEN 'user:' || sender_user_id::text ELSE sender_guest_key END, '') = ?", [$ownerIdentity])
                        ->whereRaw("COALESCE(CASE WHEN recipient_user_id IS NOT NULL THEN 'user:' || recipient_user_id::text ELSE recipient_guest_key END, '') = ?", [$senderIdentity]);
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

        $senderIdentity = $userId ? 'user:'.$userId : $guestKey;
        if ($senderIdentity && $recipientGuestKey) {
            try {
                $blocked = \Illuminate\Support\Facades\DB::table('direct_message_blocks')
                    ->where(function ($q) use ($recipientUserId, $recipientGuestKey) {
                        if ($recipientUserId) $q->where('owner_user_id', $recipientUserId);
                        else $q->where('owner_guest_key', $recipientGuestKey);
                    })
                    ->whereIn('thread_id', [$threadId, $senderIdentity])
                    ->exists();
                abort_if($blocked, 403, 'The recipient has blocked messages from this account.');
            } catch (\Illuminate\\Database\\QueryException $exception) {
                if (!str_contains($exception->getMessage(), 'direct_message_blocks')) throw $exception;
            }
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
            'sender_profile' => !empty($data['sender_profile'])
                ? $data['sender_profile']
                : $this->profileSnapshot($userId, $lookupKey),
            'recipient_profile' => !empty($data['recipient_profile'])
                ? $data['recipient_profile']
                : ($isCurrentSender
                    ? ($lastMessage->recipient_profile ?: $this->profileSnapshot($recipientUserId, $recipientGuestKey))
                    : ($lastMessage->sender_profile ?: $this->profileSnapshot($recipientUserId, $recipientGuestKey))),
        ]);

        if ($recipientUserId || $recipientGuestKey) {
            Notification::create([
                'user_id' => $recipientUserId,
                'guest_key' => $recipientUserId ? null : $recipientGuestKey,
                'type' => 'direct_message',
                'entity_id' => $threadId,
                'message' => '個別メッセージが届きました。',
            ]);
        }

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
            'sender_identity' => $this->senderIdentity($message),
            'sender_profile' => $message->sender_profile ?: $this->profileSnapshot($userId, $lookupKey),
            'recipient_profile' => $message->recipient_profile ?: $this->profileSnapshot($recipientUserId, $recipientGuestKey),
        ]], 201);
    }

    private function profileSnapshot(?int $userId, ?string $guestKey): array
    {
        $profile = Profile::query()
            ->when($userId, fn ($query) => $query->where('user_id', $userId))
            ->when(!$userId && $guestKey, fn ($query) => $query->where('guest_key', $guestKey))
            ->first();

        if (!$profile) return [];

        return [
            'nickname' => $profile->nickname ?: '',
            'mbti' => $profile->mbti ?: '',
            'socionics' => $profile->socionics ?: '',
            'enneagram' => $profile->enneagram ?: '',
            'otherType' => $profile->other_type ?: '',
            'bio' => $profile->bio ?: '',
            'links' => $profile->links ?: [],
            'profileImageUrl' => $profile->profile_image_url ?: '',
        ];
    }

    private function senderIdentity(DirectMessage $message): array
    {
        $snapshot = $message->sender_profile ?: [];
        if (!empty($snapshot)) {
            return [
                'mbti' => $snapshot['mbti'] ?? '',
                'socionics' => $snapshot['socionics'] ?? '',
                'enneagram' => $snapshot['enneagram'] ?? '',
                'other_type' => $snapshot['otherType'] ?? $snapshot['other_type'] ?? '',
            ];
        }

        $profile = Profile::query()
            ->when($message->sender_user_id, fn ($query) => $query->where('user_id', $message->sender_user_id))
            ->when(!$message->sender_user_id && $message->sender_guest_key, fn ($query) => $query->where('guest_key', $message->sender_guest_key))
            ->first();

        return [
            'mbti' => $profile?->mbti,
            'socionics' => $profile?->socionics,
            'enneagram' => $profile?->enneagram,
            'other_type' => $profile?->other_type,
        ];
    }

    public function markRead(Request $request, DirectMessage $directMessage)
    {
        $userId = $request->user()?->id;
        $guestKey = $request->header('X-Guest-Key');
        $lookupKey = $userId ? 'user:'.$userId : $guestKey;

        $isRecipient = ($userId && (int) $directMessage->recipient_user_id === (int) $userId)
            || ($lookupKey && $directMessage->recipient_guest_key === $lookupKey);

        abort_unless($isRecipient, 403, 'Only the recipient can mark this message as read.');

        if (!$directMessage->read_at) {
            $directMessage->forceFill(['read_at' => now()])->save();
        }

        return response()->json(['ok' => true, 'read' => true]);
    }
}
