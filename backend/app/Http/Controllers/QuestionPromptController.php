<?php

namespace App\Http\Controllers;

use App\Models\QuestionPrompt;
use Illuminate\Http\Request;

class QuestionPromptController extends Controller
{
    public function index()
    {
        return response()->json(['questions' => QuestionPrompt::where('approved', true)->latest()->limit(100)->get(['id', 'body', 'usage_count'])]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:500']]);
        $question = QuestionPrompt::create([...$data, 'user_id' => $request->user()?->id, 'guest_key' => $request->user() ? null : $request->header('X-Guest-Key')]);
        return response()->json(['question' => $question], 201);
    }
}
