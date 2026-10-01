<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('replies', function (Blueprint $table) {
            $table->foreignId('parent_reply_id')->nullable()->after('user_id')->constrained('replies')->nullOnDelete();
            $table->index(['bottle_id', 'parent_reply_id']);
        });
    }

    public function down(): void
    {
        Schema::table('replies', function (Blueprint $table) {
            $table->dropForeign(['parent_reply_id']);
            $table->dropIndex(['bottle_id', 'parent_reply_id']);
            $table->dropColumn('parent_reply_id');
        });
    }
};
