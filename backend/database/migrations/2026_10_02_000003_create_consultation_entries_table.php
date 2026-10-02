<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultation_entries', function (Blueprint $table) {
            $table->id();
            $table->string('external_id', 120)->unique();
            $table->string('parent_external_id', 120)->nullable()->index();
            $table->string('entry_type', 30)->index();
            $table->string('category', 30)->nullable()->index();
            $table->text('body')->nullable();
            $table->json('payload')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_key', 100)->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consultation_entries');
    }
};
