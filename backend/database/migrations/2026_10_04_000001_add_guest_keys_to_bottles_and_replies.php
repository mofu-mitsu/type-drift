<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bottles', function (Blueprint $table) {
            $table->string('guest_key', 100)->nullable()->after('user_id')->index();
        });
        Schema::table('replies', function (Blueprint $table) {
            $table->string('guest_key', 100)->nullable()->after('user_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('replies', fn (Blueprint $table) => $table->dropColumn('guest_key'));
        Schema::table('bottles', fn (Blueprint $table) => $table->dropColumn('guest_key'));
    }
};
