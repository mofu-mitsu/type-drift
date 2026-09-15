<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WormScoreController extends Controller
{
    public function index()
    {
        return response()->json([
            'scores' => DB::table('worm_scores')
                ->orderByDesc('score')
                ->orderBy('updated_at')
                ->get(['client_key', 'nickname', 'score', 'updated_at']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'clientKey' => ['required', 'string', 'max:100'],
            'nickname' => ['required', 'string', 'max:80'],
            'score' => ['required', 'integer', 'min:0', 'max:100000'],
        ]);

        $existing = DB::table('worm_scores')
            ->where('client_key', $data['clientKey'])
            ->first();

        if (!$existing || $data['score'] > $existing->score) {
            DB::table('worm_scores')->updateOrInsert(
                ['client_key' => $data['clientKey']],
                [
                    'nickname' => $data['nickname'],
                    'score' => $data['score'],
                    'updated_at' => now(),
                    'created_at' => $existing?->created_at ?? now(),
                ]
            );
        }

        return response()->json(['ok' => true]);
    }
}
