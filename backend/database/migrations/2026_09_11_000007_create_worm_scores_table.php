<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('worm_scores', function (Blueprint $table) {
            $table->id();
            $table->string('client_key', 100)->unique();
            $table->string('nickname', 80);
            $table->unsignedInteger('score')->default(0);
            $table->timestamps();
            $table->index(['score', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('worm_scores');
    }
};
