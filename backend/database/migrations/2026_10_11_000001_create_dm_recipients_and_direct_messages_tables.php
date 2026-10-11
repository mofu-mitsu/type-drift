<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dm_recipients', function (Blueprint $table) {
            $table->id();
            $table->uuid('handle')->unique();
            $table->unsignedBigInteger('user_id')->nullable()->unique();
            $table->string('guest_key', 120)->nullable()->unique();
            $table->timestamps();
        });

        Schema::create('direct_messages', function (Blueprint $table) {
            $table->id();
            $table->uuid('sender_handle')->index();
            $table->uuid('recipient_handle')->index();
            $table->unsignedBigInteger('sender_user_id')->nullable();
            $table->unsignedBigInteger('recipient_user_id')->nullable();
            $table->string('sender_name', 80)->default('匿名の誰か');
            $table->string('recipient_name', 80)->default('匿名の誰か');
            $table->string('sender_emoji', 16)->default('◌');
            $table->string('recipient_emoji', 16)->default('◌');
            $table->text('body');
            $table->unsignedBigInteger('bottle_id')->nullable()->index();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->index(['recipient_handle', 'read_at', 'created_at']);
            $table->index(['sender_handle', 'recipient_handle', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('direct_messages');
        Schema::dropIfExists('dm_recipients');
    }
};
