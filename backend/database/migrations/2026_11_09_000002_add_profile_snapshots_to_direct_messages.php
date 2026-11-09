<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            if (!Schema::hasColumn('direct_messages', 'sender_profile')) {
                $table->json('sender_profile')->nullable();
            }
            if (!Schema::hasColumn('direct_messages', 'recipient_profile')) {
                $table->json('recipient_profile')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('direct_messages', function (Blueprint $table) {
            if (Schema::hasColumn('direct_messages', 'sender_profile')) {
                $table->dropColumn('sender_profile');
            }
            if (Schema::hasColumn('direct_messages', 'recipient_profile')) {
                $table->dropColumn('recipient_profile');
            }
        });
    }
};
