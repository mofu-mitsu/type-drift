<?php

namespace App\Http\Controllers;

use App\Models\Bottle;
use App\Models\PollVote;
use App\Models\Profile;
use App\Models\Reaction;
use App\Models\Reply;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BottleController extends Controller
{
    public function index(Request $request)
    {
        $query = Bottle::query()->latest();
        if ($request->filled('mbti')) $query->whereRaw('LOWER(mbti) = ?', [strtolower($request->string('mbti')->toString())]);
        if ($request->filled('socionics')) $query->whereRaw('LOWER(socionics) = ?', [strtolower($request->string('socionics')->toString())]);
        if ($request->filled('q')) $query->where('body', 'ilike', '%'.$request->string('q')->toString().'%');
        return response()->json(['bottles' => $query->paginate(20)]);
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
        ]);
        $data['user_id'] = $request->user()?->id;
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
        return response()->json(['level' => $reaction->fresh()->level]);
    }

    public function reply(Request $request, Bottle $bottle)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        $reply = $bottle->replies()->create(['body' => $data['body'], 'user_id' => $request->user()?->id]);
        return response()->json(['reply' => $reply], 201);
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
        $data = $request->validate(['nickname' => ['nullable', 'string', 'max:80'], 'mbti' => ['nullable', 'string', 'max:8'], 'socionics' => ['nullable', 'string', 'max:12'], 'enneagram' => ['nullable', 'string', 'max:20'], 'other_type' => ['nullable', 'string', 'max:120']]);
        $profile = Profile::updateOrCreate(['user_id' => $request->user()->id], $data);
        return response()->json(['profile' => $profile]);
    }
}
