<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PollVote extends Model
{
    protected $fillable = ['bottle_id', 'user_id', 'option_index', 'guest_key'];
}
