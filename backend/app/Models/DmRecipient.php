<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DmRecipient extends Model
{
    protected $fillable = ['handle', 'user_id', 'guest_key'];
}
