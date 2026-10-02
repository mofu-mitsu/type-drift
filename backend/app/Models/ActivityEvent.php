<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ActivityEvent extends Model
{
    protected $fillable = ['user_id', 'guest_key', 'event_type', 'entity_type', 'entity_id', 'payload'];

    protected $casts = ['payload' => 'array'];
}
