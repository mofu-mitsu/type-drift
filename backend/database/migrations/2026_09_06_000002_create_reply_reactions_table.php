<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reply_reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reply_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_key', 100)->nullable();
            $table->unsignedSmallInteger('level')->default(1);
            $table->timestamps();
            $table->unique(['reply_id', 'user_id']);
            $table->index(['reply_id', 'guest_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reply_reactions');
    }
};
