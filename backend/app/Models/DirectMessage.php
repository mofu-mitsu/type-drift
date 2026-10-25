<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DirectMessage extends Model
{
    protected $fillable = [
        'sender_handle', 'recipient_handle', 'sender_user_id', 'recipient_user_id',
        'sender_name', 'recipient_name', 'sender_emoji', 'recipient_emoji',
        'body', 'bottle_id', 'read_at', 'bottle_snippet', 'bottle_author', 'bottle_type',
    ];

    protected $casts = ['read_at' => 'datetime'];
}
