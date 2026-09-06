<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlazaMessage extends Model
{
    protected $fillable = ['user_id', 'nickname', 'body', 'guest_key'];
}
