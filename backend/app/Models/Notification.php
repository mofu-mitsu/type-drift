<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    protected $fillable = ['user_id', 'guest_key', 'type', 'entity_id', 'message', 'read_at'];
    protected $casts = ['read_at' => 'datetime'];
}
