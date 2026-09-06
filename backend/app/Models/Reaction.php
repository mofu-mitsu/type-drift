<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Reaction extends Model
{
    protected $fillable = ['bottle_id', 'user_id', 'level', 'guest_key'];
}
