<?php

namespace App\Http\Controllers;

use App\Events\WormPositionUpdated;
use Illuminate\Http\Request;

class WormController extends Controller
{
    public function position(Request $request)
    {
        $data = $request->validate([
            'clientId' => ['required', 'string', 'max:80'],
            'name' => ['required', 'string', 'max:40'],
            'emoji' => ['required', 'string', 'max:8'],
            'body' => ['required', 'string', 'max:8'],
            'x' => ['required', 'numeric', 'between:0,3000'],
            'y' => ['required', 'numeric', 'between:0,3000'],
            'dirX' => ['required', 'numeric', 'between:-1,1'],
            'dirY' => ['required', 'numeric', 'between:-1,1'],
            'score' => ['required', 'integer', 'min:0', 'max:100000'],
            'length' => ['required', 'integer', 'min:3', 'max:600'],
            'isAlive' => ['required', 'boolean'],
        ]);

        broadcast(new WormPositionUpdated([
            'clientId' => $data['clientId'],
            'name' => $data['name'],
            'emoji' => $data['emoji'],
            'body' => $data['body'],
            'x' => (float) $data['x'],
            'y' => (float) $data['y'],
            'dirX' => (float) $data['dirX'],
            'dirY' => (float) $data['dirY'],
            'score' => (int) $data['score'],
            'length' => (int) $data['length'],
            'isAlive' => (bool) $data['isAlive'],
            'sentAt' => now()->valueOf(),
        ]));

        return response()->json(['ok' => true]);
    }
}
