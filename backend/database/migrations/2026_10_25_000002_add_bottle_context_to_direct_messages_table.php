<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->text('bottle_snippet')->nullable();
            $table->string('bottle_author', 120)->nullable();
            $table->string('bottle_type', 160)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropColumn(['bottle_snippet', 'bottle_author', 'bottle_type']);
        });
    }
};
