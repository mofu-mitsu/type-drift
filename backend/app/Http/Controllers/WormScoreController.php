<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WormScoreController extends Controller
{
    public function index(Request $request)
    {
        $clientKey = $request->query('clientKey');

        $scores = DB::table('worm_scores')
            ->orderByDesc('score')
            ->orderBy('updated_at')
            ->limit(5)
            ->get(['client_key', 'nickname', 'score', 'updated_at']);

        if ($clientKey) {
            $self = DB::table('worm_scores')
                ->where('client_key', $clientKey)
                ->first(['client_key', 'nickname', 'score', 'updated_at']);

            if ($self && !$scores->contains(fn ($row) => $row->client_key === $self->client_key)) {
                $scores->push($self);
            }
        }

        return response()->json([
            'scores' => $scores->values(),
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
