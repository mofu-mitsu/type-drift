<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            if (!Schema::hasColumn('direct_messages', 'sender_user_id')) {
                $table->unsignedBigInteger('sender_user_id')->nullable()->index();
            }
            if (!Schema::hasColumn('direct_messages', 'recipient_user_id')) {
                $table->unsignedBigInteger('recipient_user_id')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            if (Schema::hasColumn('direct_messages', 'sender_user_id')) {
                $table->dropColumn('sender_user_id');
            }
            if (Schema::hasColumn('direct_messages', 'recipient_user_id')) {
                $table->dropColumn('recipient_user_id');
            }
        });
    }
};
