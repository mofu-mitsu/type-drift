<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Reply extends Model
{
    use SoftDeletes;
    protected $fillable = ['bottle_id', 'user_id', 'parent_reply_id', 'body'];

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_reply_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_reply_id');
    }

    public function reactions()
    {
        return $this->hasMany(ReplyReaction::class);
    }
}
