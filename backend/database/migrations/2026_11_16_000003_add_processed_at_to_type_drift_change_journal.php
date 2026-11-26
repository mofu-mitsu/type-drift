<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Never use an event ID as a durable commit-order watermark.
        DB::unprepared(<<<'SQL'
            ALTER TABLE public.type_drift_change_journal
                ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ NULL;

            CREATE INDEX IF NOT EXISTS type_drift_change_journal_pending_idx
                ON public.type_drift_change_journal (id)
                WHERE processed_at IS NULL;
        SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            DROP INDEX IF EXISTS public.type_drift_change_journal_pending_idx;
            ALTER TABLE public.type_drift_change_journal
                DROP COLUMN IF EXISTS processed_at;
        SQL);
    }
};
