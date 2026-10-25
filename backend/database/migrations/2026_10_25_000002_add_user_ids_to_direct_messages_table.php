<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->unsignedBigInteger('sender_user_id')->nullable()->index();
            $table->unsignedBigInteger('recipient_user_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            $table->dropIndex(['sender_user_id']);
            $table->dropIndex(['recipient_user_id']);
            $table->dropColumn(['sender_user_id', 'recipient_user_id']);
        });
    }
};
