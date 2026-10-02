<?php

namespace App\Http\Controllers;

use App\Models\ConsultationEntry;
use Illuminate\Http\Request;

class ConsultationController extends Controller
{
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
        return response()->json(['ok' => true, 'entry' => $entry], 201);
    }
}
