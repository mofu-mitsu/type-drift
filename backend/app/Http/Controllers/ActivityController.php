<?php

namespace App\Http\Controllers;

use App\Models\ActivityEvent;
use App\Models\PresenceSession;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ActivityController extends Controller
{
    public function event(Request $request)
    {
        $data = $request->validate([
            'event_type' => ['required', 'string', 'max:80'],
            'entity_type' => ['nullable', 'string', 'max:80'],
            'entity_id' => ['nullable', 'string', 'max:120'],
            'payload' => ['nullable', 'array'],
        ]);

        $event = ActivityEvent::create([
            ...$data,
            'user_id' => $request->user()?->id,
            'guest_key' => $request->user() ? null : $request->header('X-Guest-Key'),
        ]);

        return response()->json(['ok' => true, 'event_id' => $event->id], 201);
    }

    public function join(Request $request)
    {
        $data = $request->validate(['session_key' => ['required', 'string', 'max:120'], 'nickname' => ['nullable', 'string', 'max:80']]);
        $now = Carbon::now();
        $session = PresenceSession::updateOrCreate(
            ['session_key' => $data['session_key']],
            [
                'user_id' => $request->user()?->id,
                'guest_key' => $request->user() ? null : $request->header('X-Guest-Key'),
                'nickname' => $data['nickname'] ?? null,
                'last_seen_at' => $now,
                'joined_at' => $now,
                'left_at' => null,
                'active' => true,
            ]
        );
        return $this->presenceResponse($session);
    }

    public function heartbeat(Request $request)
    {
        $data = $request->validate(['session_key' => ['required', 'string', 'max:120']]);
        $session = PresenceSession::where('session_key', $data['session_key'])->firstOrFail();
        $session->update(['last_seen_at' => Carbon::now(), 'left_at' => null, 'active' => true]);
        return $this->presenceResponse($session);
    }

    public function leave(Request $request)
    {
        $data = $request->validate(['session_key' => ['required', 'string', 'max:120']]);
        PresenceSession::where('session_key', $data['session_key'])->update(['left_at' => Carbon::now(), 'active' => false]);
        return response()->json(['ok' => true]);
    }

    public function online()
    {
        $cutoff = Carbon::now()->subSeconds(45);
        PresenceSession::where('active', true)->where('last_seen_at', '<', $cutoff)->update(['active' => false, 'left_at' => Carbon::now()]);
        return response()->json(['count' => PresenceSession::where('active', true)->count()]);
    }

    private function presenceResponse(PresenceSession $session)
    {
        return response()->json(['ok' => true, 'session' => $session->only(['session_key', 'nickname', 'last_seen_at']), 'count' => PresenceSession::where('active', true)->count()]);
    }
}
