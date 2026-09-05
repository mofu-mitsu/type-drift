<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Casts;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable(['user_id', 'body', 'image_url', 'mbti', 'socionics', 'enneagram', 'other_type', 'is_ai', 'poll_options'])]
#[Casts(['poll_options' => 'array', 'is_ai' => 'boolean'])]
class Bottle extends Model
{
    use SoftDeletes;

    public function replies()
    {
        return $this->hasMany(Reply::class);
    }
}
