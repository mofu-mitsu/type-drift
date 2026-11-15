<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('replies', function (Blueprint $table) {
            $table->foreignId('bottle_owner_user_id')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
            $table->string('bottle_owner_guest_key', 200)->nullable()->after('bottle_owner_user_id')->index();
        });
    }

    public function down(): void
    {
        Schema::table('replies', function (Blueprint $table) {
            $table->dropForeign(['bottle_owner_user_id']);
            $table->dropIndex(['bottle_owner_guest_key']);
            $table->dropColumn(['bottle_owner_user_id', 'bottle_owner_guest_key']);
        });
    }
};
