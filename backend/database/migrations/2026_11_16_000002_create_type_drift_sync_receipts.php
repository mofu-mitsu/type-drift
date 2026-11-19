<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Support\\Facades\\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            CREATE TABLE IF NOT EXISTS public.type_drift_sync_receipts (
                source_id TEXT NOT NULL,
                source_event_id BIGINT NOT NULL,
                table_name TEXT NOT NULL,
                operation CHAR(1) NOT NULL CHECK (operation IN ('I', 'U', 'D')),
                applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                PRIMARY KEY (source_id, source_event_id)
            );

            CREATE TABLE IF NOT EXISTS public.type_drift_sync_checkpoints (
                source_id TEXT PRIMARY KEY,
                last_event_id BIGINT NOT NULL DEFAULT 0 CHECK (last_event_id >= 0),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
                status TEXT NOT NULL DEFAULT 'idle'
                    CHECK (status IN ('idle', 'running', 'paused', 'error')),
                last_error TEXT NULL
            );
        SQL);
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            DROP TABLE IF EXISTS public.type_drift_sync_checkpoints;
            DROP TABLE IF EXISTS public.type_drift_sync_receipts;
        SQL);
    }
};
