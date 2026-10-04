<?php

namespace App\Http\Controllers;

use App\Models\ConsultationEntry;
use App\Models\Notification;
use App\Events\ConsultationUpdated;
use Illuminate\Http\Request;

class ConsultationController extends Controller
{
    public function index()
    {
        return response()->json(['entries' => ConsultationEntry::query()->where('entry_type', 'thread')->latest()->limit(100)->get()]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'external_id' => ['required', 'string', 'max:120'],
            'parent_external_id' => ['nullable', 'string', 'max:120'],
            'entry_type' => ['required', 'in:thread,reply,followup'],
            'category' => ['nullable', 'string', 'max:30'],
            'body' => ['nullable', 'string', 'max:10000'],
            'payload' => ['nullable', 'array'],
        ]);
        $entry = ConsultationEntry::updateOrCreate(
            ['external_id' => $data['external_id']],
            [...$data, 'user_id' => $request->user()?->id, 'guest_key' => $request->user() ? null : $request->header('X-Guest-Key')]
        );
        if ($data['entry_type'] !== 'thread' && !empty($data['parent_external_id'])) {
            $parent = ConsultationEntry::where('external_id', $data['parent_external_id'])->first();
            if ($parent && ($parent->user_id || $parent->guest_key)) {
                Notification::create(['user_id' => $parent->user_id, 'guest_key' => $parent->guest_key, 'type' => 'consultation_reply', 'entity_id' => $parent->external_id, 'message' => '自認相談室に新しい返信が届きました。']);
            }
        }
        broadcast(new ConsultationUpdated($entry->external_id, $entry->entry_type));
        return response()->json(['ok' => true, 'entry' => $entry], 201);
    }
}
