<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Profile extends Model
{
    protected $fillable = ['user_id', 'nickname', 'mbti', 'socionics', 'enneagram', 'other_type', 'bio', 'links', 'profile_image_url'];
    protected $casts = ['links' => 'array'];
}
