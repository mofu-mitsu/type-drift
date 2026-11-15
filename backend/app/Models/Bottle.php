<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Casts;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['user_id', 'guest_key', 'body', 'image_url', 'mbti', 'socionics', 'enneagram', 'other_type', 'is_ai', 'ai_character', 'poll_options', 'allow_likes', 'allow_replies'])]
#[Casts(['poll_options' => 'array', 'is_ai' => 'boolean', 'allow_likes' => 'boolean', 'allow_replies' => 'boolean'])]
class Bottle extends Model
{
    use SoftDeletes;

    public function replies()
    {
        return $this->hasMany(Reply::class)->whereNull('parent_reply_id');
    }

    public function reactions()
    {
        return $this->hasMany(Reaction::class);
    }
}
