<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ConsultationEntry extends Model
{
    protected $fillable = ['external_id', 'parent_external_id', 'entry_type', 'category', 'body', 'payload', 'user_id', 'guest_key'];

    protected $casts = ['payload' => 'array'];
}
