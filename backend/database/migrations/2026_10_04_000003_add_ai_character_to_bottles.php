<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bottles', function (Blueprint $table) {
            $table->string('ai_character', 60)->nullable()->after('is_ai');
        });
    }

    public function down(): void
    {
        Schema::table('bottles', fn (Blueprint $table) => $table->dropColumn('ai_character'));
    }
};
