<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_key', 100)->nullable()->index();
            $table->string('type', 60)->index();
            $table->string('entity_id', 120)->nullable();
            $table->string('message', 240);
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['guest_key', 'read_at']);
        });
    }

    public function down(): void { Schema::dropIfExists('notifications'); }
};
