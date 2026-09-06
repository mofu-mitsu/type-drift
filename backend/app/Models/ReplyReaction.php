<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReplyReaction extends Model
{
    protected $fillable = ['reply_id', 'user_id', 'guest_key', 'level'];
}
