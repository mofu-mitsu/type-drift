<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('direct_messages', function (Blueprint $table) {
            $table->id();
            $table->string('sender_guest_key', 100)->index();
            $table->string('recipient_guest_key', 100)->index();
            $table->string('thread_id', 120)->index();
            $table->string('sender_name', 100)->default('匿名の誰か');
            $table->string('recipient_name', 100)->default('匿名の誰か');
            $table->text('body');
            $table->unsignedBigInteger('bottle_id')->nullable()->index();
            $table->text('bottle_snippet')->nullable();
            $table->string('bottle_author', 120)->nullable();
            $table->string('bottle_type', 160)->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['recipient_guest_key', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('direct_messages');
    }
};

