<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('nickname', 80)->nullable();
            $table->string('mbti', 8)->nullable();
            $table->string('socionics', 12)->nullable();
            $table->string('enneagram', 20)->nullable();
            $table->string('other_type', 120)->nullable();
            $table->timestamps();
        });

        Schema::create('bottles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->string('image_url')->nullable();
            $table->string('mbti', 8)->nullable()->index();
            $table->string('socionics', 12)->nullable()->index();
            $table->string('enneagram', 20)->nullable();
            $table->string('other_type', 120)->nullable();
            $table->boolean('is_ai')->default(false);
            $table->json('poll_options')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('reactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bottle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('level')->default(1);
            $table->string('guest_key', 100)->nullable();
            $table->timestamps();
            $table->unique(['bottle_id', 'user_id']);
            $table->index(['bottle_id', 'guest_key']);
        });

        Schema::create('replies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bottle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->text('body');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('poll_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bottle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('option_index');
            $table->string('guest_key', 100)->nullable();
            $table->timestamps();
            $table->unique(['bottle_id', 'user_id']);
            $table->index(['bottle_id', 'guest_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('poll_votes');
        Schema::dropIfExists('replies');
        Schema::dropIfExists('reactions');
        Schema::dropIfExists('bottles');
        Schema::dropIfExists('profiles');
    }
};
