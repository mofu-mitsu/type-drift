<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PresenceSession extends Model
{
    protected $fillable = ['session_key', 'user_id', 'guest_key', 'nickname', 'last_seen_at', 'joined_at', 'left_at', 'active'];

    protected $casts = ['last_seen_at' => 'datetime', 'joined_at' => 'datetime', 'left_at' => 'datetime', 'active' => 'boolean'];
}
