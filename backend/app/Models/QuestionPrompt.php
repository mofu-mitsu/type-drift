<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QuestionPrompt extends Model
{
    protected $fillable = ['body', 'user_id', 'guest_key', 'approved', 'usage_count'];
    protected $casts = ['approved' => 'boolean'];
}
