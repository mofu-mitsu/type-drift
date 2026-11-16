<?php

namespace App\Http\Controllers;

use App\Models\Bottle;
use App\Models\PollVote;
use App\Models\Profile;
use App\Models\PlazaMessage;
use App\Models\Reaction;
use App\Models\Reply;
use App\Models\ReplyReaction;
use App\Models\Feedback;
use App\Models\Notification;
use App\Models\DirectMessage;
use App\Events\BottleActivityUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BottleController extends Controller
{
    public function index(Request $request)
    {
        $query = Bottle::query()->withCount(['replies'])->withSum('reactions', 'level')->latest();
        if ($request->filled('mbti')) $query->whereRaw('LOWER(mbti) = ?', [strtolower($request->string('mbti')->toString())]);
        if ($request->filled('socionics')) $query->whereRaw('LOWER(socionics) = ?', [strtolower($request->string('socionics')->toString())]);
        if ($request->filled('q')) $query->where('body', 'ilike', '%'.$request->string('q')->toString().'%');
        $page = $query->paginate(20);
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        $page->getCollection()->transform(function (Bottle $bottle) use ($userId, $guestKey) {
            $bottle->is_mine = ($userId && $bottle->user_id === $userId)
                || (!$userId && $guestKey && $bottle->guest_key === $guestKey);
            $bottle->reaction_level = Reaction::query()
                ->where('bottle_id', $bottle->id)
                ->when($userId, fn ($query) => $query->where('user_id', $userId), fn ($query) => $query->where('guest_key', $guestKey))
                ->value('level') ?? 0;
            return $bottle;
        });
        return response()->json(['bottles' => $page]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:5000'],
            'image_url' => ['nullable', 'url', 'max:2048'],
            'mbti' => ['nullable', 'string', 'max:8'],
            'socionics' => ['nullable', 'string', 'max:12'],
            'enneagram' => ['nullable', 'string', 'max:20'],
            'other_type' => ['nullable', 'string', 'max:120'],
            'poll_options' => ['nullable', 'array', 'min:2'],
            'poll_options.*' => ['string', 'max:100'],
            'is_ai' => ['nullable', 'boolean'],
            'ai_character' => ['nullable', 'string', 'max:60'],
            'allow_likes' => ['sometimes', 'boolean'],
            'allow_replies' => ['sometimes', 'boolean'],
        ]);
        $data['user_id'] = $request->user()?->id;
        $data['guest_key'] = $request->user() ? null : $request->header('X-Guest-Key');
        $bottle = Bottle::create($data);
        return response()->json(['bottle' => $bottle], 201);
    }

    public function react(Request $request, Bottle $bottle)
    {
        abort_if($bottle->allow_likes === false, 403, 'Likes are disabled for this bottle.');
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless($userId || $guestKey, 422, 'A guest key is required.');
        $reaction = Reaction::query()->where('bottle_id', $bottle->id)->when($userId, fn ($q) => $q->where('user_id', $userId), fn ($q) => $q->where('guest_key', $guestKey))->first();
        if ($reaction) $reaction->increment('level');
        else $reaction = Reaction::create(['bottle_id' => $bottle->id, 'user_id' => $userId, 'guest_key' => $guestKey, 'level' => 1]);
        $this->notifyOwner($bottle->user_id, $bottle->guest_key, 'bottle_reaction', (string) $bottle->id, 'あなたのボトルに新しい反応が届きました。', $userId, $guestKey);
        $this->broadcastSafely(new BottleActivityUpdated($bottle->id, 'reaction'));
        return response()->json(['level' => $reaction->fresh()->level]);
    }

    public function reply(Request $request, Bottle $bottle)
    {
        abort_if($bottle->allow_replies === false, 403, 'Replies are disabled for this bottle.');
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'parent_reply_id' => ['nullable', 'integer', 'exists:replies,id']]);
        if (!empty($data['parent_reply_id'])) {
            abort_unless(Reply::query()->whereKey($data['parent_reply_id'])->where('bottle_id', $bottle->id)->exists(), 422, 'The parent reply must belong to this bottle.');
        }
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        $senderIdentity = $userId ? 'user:'.$userId : $guestKey;
        $ownerIdentity = $bottle->user_id ? 'user:'.$bottle->user_id : $bottle->guest_key;
        if ($senderIdentity && $ownerIdentity && $senderIdentity !== $ownerIdentity) {
            try {
                $blocked = DB::table('direct_message_blocks')
                    ->where(function ($q) use ($bottle, $ownerIdentity) {
                        if ($bottle->user_id) $q->where('owner_user_id', $bottle->user_id);
                        else $q->where('owner_guest_key', $bottle->guest_key);
                    })
                    ->whereIn('thread_id', ['bottle-'.$bottle->id, $senderIdentity, $guestKey ?: 'user:'.$userId])
                    ->exists();
                abort_if($blocked, 403, 'The bottle owner has blocked messages from this account.');
            } catch (\Illuminate\\Database\\QueryException $exception) {
                // Older installations without the block table retain the normal reply flow.
                if (!str_contains($exception->getMessage(), 'direct_message_blocks')) throw $exception;
            }
        }
        $reply = Reply::create(['bottle_id' => $bottle->id, 'body' => $data['body'], 'parent_reply_id' => $data['parent_reply_id'] ?? null, 'user_id' => $userId, 'guest_key' => $guestKey, 'bottle_owner_user_id' => $bottle->user_id, 'bottle_owner_guest_key' => $bottle->guest_key]);

        // A bottle reply is also delivered to the bottle owner's private inbox.
        // Keep the shared thread tied to the original bottle so both sides see its context.
        $directMessage = null;
        // Prefer account IDs whenever available. A stale guest_key may remain on a
        // signed-in profile/bottle, but must never override the account's real identity.
        $senderGuestKey = $userId ? 'user:'.$userId : $guestKey;
        $ownerGuestKey = $bottle->user_id ? 'user:'.$bottle->user_id : $bottle->guest_key;
        // A bottle addressed to an NPC starts a private conversation with that NPC,
        // not with the human who originally submitted the bottle.
        $npcCharacter = (string) ($bottle->ai_character ?? '');
        // 本文に「LSI芋虫」などの語が含まれるだけでNPC宛てと判定しない。
        // 実際にNPCとして登録されたボトルだけをNPC会話として扱う。
        $isNpcBottle = (bool) $bottle->is_ai || $npcCharacter !== '';
        $npcKey = $isNpcBottle
            ? (preg_match('/ダーリン|🥺/u', $npcCharacter) ? 'ai:darling' : (preg_match('/芋虫|LSI|🐛/u', $npcCharacter) ? 'ai:lsi-worm' : null))
            : null;
        $npcName = $npcKey === 'ai:darling' ? 'ダーリンちゃん' : ($npcKey === 'ai:lsi-worm' ? 'LSI芋虫' : null);
        $isNpcConversation = $isNpcBottle && $npcKey !== null;
        if ($isNpcConversation) $ownerGuestKey = $npcKey;
        $isOwnBottle = ($userId && $bottle->user_id && (int) $userId === (int) $bottle->user_id)
            || ($guestKey && $bottle->guest_key && hash_equals($bottle->guest_key, $guestKey));

        if (!$isOwnBottle && $senderGuestKey && $ownerGuestKey) {
            $bottleType = trim(implode(' · ', array_filter([
                $bottle->mbti,
                $bottle->socionics,
                $bottle->enneagram,
                $bottle->other_type,
            ])));

            $recipientProfile = $this->profileSnapshot($bottle->user_id, $bottle->guest_key);
            $recipientProfile['mbti'] = $bottle->mbti ?: ($recipientProfile['mbti'] ?? '');
            $recipientProfile['socionics'] = $bottle->socionics ?: ($recipientProfile['socionics'] ?? '');
            $recipientProfile['enneagram'] = $bottle->enneagram ?: ($recipientProfile['enneagram'] ?? '');
            $recipientProfile['otherType'] = $bottle->other_type ?: ($recipientProfile['otherType'] ?? '');

            $directMessage = DirectMessage::create([
                'sender_guest_key' => $senderGuestKey,
                'recipient_guest_key' => $ownerGuestKey,
                'sender_user_id' => $userId,
                'recipient_user_id' => $isNpcConversation ? null : $bottle->user_id,
                'thread_id' => 'bottle-'.$bottle->id.($isNpcConversation ? '-npc-pair-' : '-pair-').implode('--', (function () use ($senderGuestKey, $ownerGuestKey) { $participants = array_values(array_unique(array_filter([$senderGuestKey, $ownerGuestKey]))); sort($participants, SORT_STRING); return $participants; })()),
                'sender_name' => $guestKey === 'ai:darling' ? 'ダーリンちゃん' : ($guestKey === 'ai:lsi-worm' ? 'LSI芋虫' : '匿名の誰か'),
                'recipient_name' => $npcName ?: '波間に漂うボトルの主（匿名）',
                'body' => $reply->body,
                'bottle_id' => $bottle->id,
                'bottle_snippet' => $bottle->body,
                'bottle_author' => $npcName ?: '匿名のボトル主',
                'bottle_type' => $bottleType ?: '匿名ボトル',
                'sender_profile' => $this->profileSnapshot($userId, $guestKey),
                'recipient_profile' => $recipientProfile,
            ]);
        }

        // Broadcast only after the reply is committed so refreshes can retrieve it.
        $this->broadcastSafely(new BottleActivityUpdated($bottle->id, 'reply'));
        // NPC宛ての返信はNPC会話として扱い、誤ってボトル所有者通知を発生させない。
        if (!$isNpcConversation) $this->notifyOwner($bottle->user_id, $bottle->guest_key, 'bottle_reply', (string) $bottle->id, 'あなたのボトルに返信が届きました。', $userId, $guestKey);
        if (!empty($data['parent_reply_id'])) {
            $parent = Reply::find($data['parent_reply_id']);
            $this->notifyOwner($parent?->user_id, $parent?->guest_key, 'reply_reply', (string) $reply->id, 'あなたの返信に、さらに返事が届きました。', $userId, $guestKey);
        }
        return response()->json(['reply' => $reply, 'direct_message' => $directMessage], 201);
    }

    public function update(Request $request, Bottle $bottle)
    {
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless(($userId && $bottle->user_id === $userId) || (!$userId && $guestKey && $bottle->guest_key === $guestKey), 403);

        $data = $request->validate([
            'allow_likes' => ['sometimes', 'boolean'],
            'allow_replies' => ['sometimes', 'boolean'],
        ]);
        abort_if(empty($data), 422, 'No bottle settings were provided.');

        $bottle->fill($data);
        $bottle->save();

        return response()->json(['bottle' => $bottle->fresh()]);
    }

    public function destroy(Request $request, Bottle $bottle)
    {
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless(($userId && $bottle->user_id === $userId) || (!$userId && $guestKey && $bottle->guest_key === $guestKey), 403);
        // NPC投稿は所有者キーが誤って一致しても、ユーザーによる回収（削除）を許可しない。
        abort_if((bool) $bottle->is_ai || !empty($bottle->ai_character), 403, "NPC bottles cannot be deleted.");
        $bottle->delete();
        return response()->json(['ok' => true]);
    }

    public function replies(Request $request, Bottle $bottle)
    {
        // Reply text is private to the account that sent it. The bottle feed exposes counts only;
        // the bottle owner receives incoming replies through their private inbox instead.
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        if (!$userId && !$guestKey) {
            return response()->json(['replies' => []]);
        }
        $ownReplies = $bottle->replies()
            ->when($userId, fn ($query) => $query->where('user_id', $userId), fn ($query) => $query->where('guest_key', $guestKey))
            ->with('reactions')
            ->latest()
            ->get();
        // If a reply was nested under another account's private reply, show only the current
        // account's own text as a root item; never include somebody else's parent or child.
        $ownReplies->each(fn ($reply) => $reply->setAttribute('parent_reply_id', null));
        return response()->json(['replies' => $ownReplies]);
    }

    public function reactToReply(Request $request, Reply $reply)
    {
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless($userId || $guestKey, 422, 'A guest key is required.');
        $reaction = ReplyReaction::query()->where('reply_id', $reply->id)->when($userId, fn ($q) => $q->where('user_id', $userId), fn ($q) => $q->where('guest_key', $guestKey))->first();
        if ($reaction) $reaction->increment('level');
        else $reaction = ReplyReaction::create(['reply_id' => $reply->id, 'user_id' => $userId, 'guest_key' => $guestKey, 'level' => 1]);
        $this->notifyOwner($reply->user_id, $reply->guest_key, 'reply_reaction', (string) $reply->id, 'あなたの返信に新しい反応が届きました。', $userId, $guestKey);
        $this->broadcastSafely(new BottleActivityUpdated($reply->bottle_id, 'reply_reaction'));
        return response()->json(['level' => $reaction->fresh()->level]);
    }

    public function feedback(Request $request)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'category' => ['nullable', 'string', 'max:40'], 'contact_email' => ['nullable', 'email', 'max:255']]);
        $feedback = Feedback::create([...$data, 'user_id' => $request->user()?->id, 'guest_key' => $request->user() ? null : $request->header('X-Guest-Key')]);
        return response()->json(['feedback' => ['id' => $feedback->id, 'status' => $feedback->status]], 201);
    }

    public function vote(Request $request, Bottle $bottle)
    {
        abort_if($bottle->allow_replies === false, 403, 'Interactions are disabled for this bottle.');
        $data = $request->validate(['option_index' => ['required', 'integer', 'min:0']]);
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless($userId || $guestKey, 422, 'A guest key is required.');
        $vote = PollVote::query()->when($userId, fn ($q) => $q->where('user_id', $userId), fn ($q) => $q->where('guest_key', $guestKey))->where('bottle_id', $bottle->id)->first();
        if (!$vote) PollVote::create(['bottle_id' => $bottle->id, 'user_id' => $userId, 'guest_key' => $guestKey, 'option_index' => $data['option_index']]);
        return response()->json(['ok' => true]);
    }

    public function profile(Request $request)
    {
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless($userId || $guestKey, 422, 'A guest key is required.');

        $data = $request->validate([
            'nickname' => ['nullable', 'string', 'max:80'],
            'mbti' => ['nullable', 'string', 'max:8'],
            'socionics' => ['nullable', 'string', 'max:12'],
            'enneagram' => ['nullable', 'string', 'max:20'],
            'other_type' => ['nullable', 'string', 'max:300'],
            'bio' => ['nullable', 'string', 'max:1000'],
            'links' => ['nullable', 'array'],
            'profile_image_url' => ['nullable', 'url', 'max:2048'],
        ]);

        $profile = Profile::updateOrCreate(
            $userId ? ['user_id' => $userId] : ['guest_key' => $guestKey],
            [...$data, 'user_id' => $userId, 'guest_key' => $guestKey]
        );
        return response()->json(['profile' => $profile]);
    }

    public function plazaMessages(Request $request)
    {
        return response()->json(['messages' => PlazaMessage::query()->latest()->limit(50)->get()->reverse()->values()]);
    }

    public function plazaMessage(Request $request)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:280'], 'nickname' => ['nullable', 'string', 'max:80']]);
        $message = PlazaMessage::create([
            'user_id' => $request->user()?->id,
            'nickname' => $data['nickname'] ?? null,
            'body' => $data['body'],
            'guest_key' => $request->user() ? null : $request->header('X-Guest-Key'),
        ]);
        return response()->json(['message' => $message], 201);
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

    private function notifyOwner(?int $ownerId, ?string $ownerGuestKey, string $type, string $entityId, string $message, ?int $actorId, ?string $actorGuestKey): void
    {
        if (!$ownerId && !$ownerGuestKey) return;
        if (($ownerId && $actorId && $ownerId === $actorId) || (!$ownerId && $ownerGuestKey && $ownerGuestKey === $actorGuestKey)) return;

        // ブロックした相手からの反応は、通知レコードを作る前に除外する。
        // block list はスレッドIDで保存されている旧データもあるため、ボトルIDと送信者IDの両方を照合する。
        if ($actorId || $actorGuestKey) {
            try {
                $actorIdentity = $actorId ? 'user:'.$actorId : $actorGuestKey;
                $blocked = DB::table('direct_message_blocks')
                    ->where(function ($query) use ($ownerId, $ownerGuestKey) {
                        if ($ownerId) $query->where('owner_user_id', $ownerId);
                        else $query->where('owner_guest_key', $ownerGuestKey);
                    })
                    ->where(function ($query) use ($actorIdentity, $type, $entityId) {
                        $query->where('thread_id', $actorIdentity)
                            ->orWhere('thread_id', 'like', '%'.$actorIdentity.'%');
                        if ($type === 'bottle_reply' || $type === 'bottle_reaction') {
                            $query->orWhere('thread_id', 'bottle-'.$entityId)
                                ->orWhere('thread_id', 'like', 'bottle-'.$entityId.'-pair-%');
                        }
                    })
                    ->exists();
                if ($blocked) return;
            } catch (\\Illuminate\\Database\\QueryException $exception) {
                if (!str_contains($exception->getMessage(), 'direct_message_blocks')) throw $exception;
            }
        }
        Notification::create(['user_id' => $ownerId, 'guest_key' => $ownerId ? null : $ownerGuestKey, 'type' => $type, 'entity_id' => $entityId, 'message' => $message]);
    }

    private function broadcastSafely(BottleActivityUpdated $event): void
    {
        try {
            broadcast($event);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }
}
