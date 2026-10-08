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
use App\Events\BottleActivityUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BottleController extends Controller
{
    public function index(Request $request)
    {
        $query = Bottle::query()->withCount(['reactions', 'replies'])->latest();
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
        ]);
        $data['user_id'] = $request->user()?->id;
        $data['guest_key'] = $request->user() ? null : $request->header('X-Guest-Key');
        $bottle = Bottle::create($data);
        return response()->json(['bottle' => $bottle], 201);
    }

    public function react(Request $request, Bottle $bottle)
    {
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
        $data = $request->validate(['body' => ['required', 'string', 'max:5000'], 'parent_reply_id' => ['nullable', 'integer', 'exists:replies,id']]);
        if (!empty($data['parent_reply_id'])) {
            abort_unless(Reply::query()->whereKey($data['parent_reply_id'])->where('bottle_id', $bottle->id)->exists(), 422, 'The parent reply must belong to this bottle.');
        }
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        $reply = Reply::create(['bottle_id' => $bottle->id, 'body' => $data['body'], 'parent_reply_id' => $data['parent_reply_id'] ?? null, 'user_id' => $userId, 'guest_key' => $guestKey]);
        // Broadcast only after the reply is committed so refreshes can retrieve it.
        $this->broadcastSafely(new BottleActivityUpdated($bottle->id, 'reply'));
        $this->notifyOwner($bottle->user_id, $bottle->guest_key, 'bottle_reply', (string) $bottle->id, 'あなたのボトルに返信が届きました。', $userId, $guestKey);
        if (!empty($data['parent_reply_id'])) {
            $parent = Reply::find($data['parent_reply_id']);
            $this->notifyOwner($parent?->user_id, $parent?->guest_key, 'reply_reply', (string) $reply->id, 'あなたの返信に、さらに返事が届きました。', $userId, $guestKey);
        }
        return response()->json(['reply' => $reply], 201);
    }

    public function destroy(Request $request, Bottle $bottle)
    {
        $userId = $request->user()?->id;
        $guestKey = $userId ? null : $request->header('X-Guest-Key');
        abort_unless(($userId && $bottle->user_id === $userId) || (!$userId && $guestKey && $bottle->guest_key === $guestKey), 403);
        $bottle->delete();
        return response()->json(['ok' => true]);
    }

    public function replies(Bottle $bottle)
    {
        return response()->json(['replies' => $bottle->replies()->with(['reactions', 'children' => fn ($query) => $query->latest(), 'children.reactions'])->latest()->get()]);
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
        abort_unless($request->user(), 401);
        $data = $request->validate(['nickname' => ['nullable', 'string', 'max:80'], 'mbti' => ['nullable', 'string', 'max:8'], 'socionics' => ['nullable', 'string', 'max:12'], 'enneagram' => ['nullable', 'string', 'max:20'], 'other_type' => ['nullable', 'string', 'max:300'], 'bio' => ['nullable', 'string', 'max:1000'], 'links' => ['nullable', 'array'], 'profile_image_url' => ['nullable', 'url', 'max:2048']]);
        $profile = Profile::updateOrCreate(['user_id' => $request->user()->id], $data);
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

    private function notifyOwner(?int $ownerId, ?string $ownerGuestKey, string $type, string $entityId, string $message, ?int $actorId, ?string $actorGuestKey): void
    {
        if (!$ownerId && !$ownerGuestKey) return;
        if (($ownerId && $actorId && $ownerId === $actorId) || (!$ownerId && $ownerGuestKey && $ownerGuestKey === $actorGuestKey)) return;
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
