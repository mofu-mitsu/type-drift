<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $hasSenderUserId = Schema::hasColumn('direct_messages', 'sender_user_id');
        $hasRecipientUserId = Schema::hasColumn('direct_messages', 'recipient_user_id');

        if (!$hasSenderUserId || !$hasRecipientUserId) {
            Schema::table('direct_messages', function (Blueprint $table) use ($hasSenderUserId, $hasRecipientUserId) {
                if (!$hasSenderUserId) {
                    $table->unsignedBigInteger('sender_user_id')->nullable()->index();
                }
                if (!$hasRecipientUserId) {
                    $table->unsignedBigInteger('recipient_user_id')->nullable()->index();
                }
            });
        }
    }

    public function down(): void
    {
        $hasSenderUserId = Schema::hasColumn('direct_messages', 'sender_user_id');
        $hasRecipientUserId = Schema::hasColumn('direct_messages', 'recipient_user_id');

        if ($hasSenderUserId || $hasRecipientUserId) {
            Schema::table('direct_messages', function (Blueprint $table) use ($hasSenderUserId, $hasRecipientUserId) {
                $columns = [];
                if ($hasSenderUserId) $columns[] = 'sender_user_id';
                if ($hasRecipientUserId) $columns[] = 'recipient_user_id';
                if ($columns) $table->dropColumn($columns);
            });
        }
    }
};
