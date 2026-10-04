<?php

namespace App\Http\Controllers;

use App\Models\PlazaChainState;
use Illuminate\Http\Request;

class PlazaChainController extends Controller
{
    public function show()
    {
        $state = PlazaChainState::query()->firstOrCreate([], ['body' => '海辺で、最初に見つけたのは']);
        return response()->json(['chain' => $state]);
    }

    public function append(Request $request)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:48']]);
        $state = PlazaChainState::query()->firstOrCreate([], ['body' => '海辺で、最初に見つけたのは']);
        $state->update([
            'body' => trim($state->body).' '.trim($data['body']),
            'updated_by' => $request->user()?->id,
            'updated_guest_key' => $request->user() ? null : $request->header('X-Guest-Key'),
        ]);
        return response()->json(['chain' => $state->fresh()], 201);
    }
}
