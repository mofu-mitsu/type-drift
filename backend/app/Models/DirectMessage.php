<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class DirectMessage extends Model
{
    protected $fillable = [
        'sender_guest_key',
        'recipient_guest_key',
        'sender_user_id',
        'recipient_user_id',
        'thread_id',
        'sender_name',
        'recipient_name',
        'body',
        'bottle_id',
        'bottle_snippet',
        'bottle_author',
        'bottle_type',
        'read_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
    ];
}
