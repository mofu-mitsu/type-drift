<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bottles', function (Blueprint $table) {
            if (!Schema::hasColumn('bottles', 'allow_likes')) {
                $table->boolean('allow_likes')->default(true);
            }
            if (!Schema::hasColumn('bottles', 'allow_replies')) {
                $table->boolean('allow_replies')->default(true);
            }
        });
    }

    public function down(): void
    {
        Schema::table('bottles', function (Blueprint $table) {
            if (Schema::hasColumn('bottles', 'allow_likes')) $table->dropColumn('allow_likes');
            if (Schema::hasColumn('bottles', 'allow_replies')) $table->dropColumn('allow_replies');
        });
    }
};
