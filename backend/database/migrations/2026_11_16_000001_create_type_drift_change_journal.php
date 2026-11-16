<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    /**
     * Capture committed row mutations in a local journal.
     *
     * This migration is PostgreSQL-only. It is intentionally not a replication
     * worker: journal rows still need a separately tested, idempotent replay
     * process before automatic failover/failback can be enabled.
     */
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::unprepared(<<<'SQL'
            CREATE TABLE IF NOT EXISTS public.type_drift_change_journal (
                id BIGSERIAL PRIMARY KEY,
                table_name TEXT NOT NULL,
                operation CHAR(1) NOT NULL CHECK (operation IN ('I', 'U', 'D')),
                primary_key JSONB NOT NULL,
                row_data JSONB NULL,
                transaction_id BIGINT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
            );

            CREATE INDEX IF NOT EXISTS type_drift_change_journal_table_id_idx
                ON public.type_drift_change_journal (table_name, id);
        SQL);

        DB::unprepared(<<<'SQL'
            CREATE OR REPLACE FUNCTION public.type_drift_capture_change()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            AS $function$
            DECLARE
                changed_row JSONB;
                key_data JSONB;
                key_column TEXT;
                op CHAR(1);
            BEGIN
                IF TG_OP = 'DELETE' THEN
                    changed_row := to_jsonb(OLD);
                    op := 'D';
                ELSIF TG_OP = 'INSERT' THEN
                    changed_row := to_jsonb(NEW);
                    op := 'I';
                ELSE
                    changed_row := to_jsonb(NEW);
                    op := 'U';
                END IF;

                key_data := '{}'::jsonb;
                FOREACH key_column IN ARRAY TG_ARGV LOOP
                    key_data := key_data || jsonb_build_object(key_column, changed_row -> key_column);
                END LOOP;

                INSERT INTO public.type_drift_change_journal
                    (table_name, operation, primary_key, row_data, transaction_id)
                VALUES (
                    TG_TABLE_NAME,
                    op,
                    key_data,
                    CASE WHEN op = 'D' THEN NULL ELSE changed_row END,
                    txid_current()
                );

                IF TG_OP = 'DELETE' THEN
                    RETURN OLD;
                END IF;

                RETURN NEW;
            END;
            $function$;
        SQL);

        // Attach the journal trigger to each public table with a primary key.
        // Internal journal and migration metadata are deliberately excluded.
        $tables = DB::select(<<<'SQL'
            SELECT
                ns.nspname AS schema_name,
                tbl.relname AS table_name,
                array_agg(att.attname ORDER BY key_column.ordinality) AS primary_key_columns
            FROM pg_index idx
            JOIN pg_class tbl ON tbl.oid = idx.indrelid
            JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
            JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                ON key_column.ordinality <= idx.indnkeyatts
            JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = key_column.attnum
            WHERE idx.indisprimary
              AND ns.nspname = 'public'
              AND tbl.relkind = 'r'
              AND tbl.relname NOT IN (
                  'type_drift_change_journal',
                  'migrations'
              )
            GROUP BY ns.nspname, tbl.relname
            ORDER BY tbl.relname
        SQL);

        foreach ($tables as $table) {
            $tableName = $table->table_name;
            $columns = is_array($table->primary_key_columns)
                ? $table->primary_key_columns
                : trim((string) $table->primary_key_columns, '{}') !== ''
                    ? str_getcsv(trim((string) $table->primary_key_columns, '{}'))
                    : [];

            if ($columns === []) {
                continue;
            }

            $quote = static fn (string $identifier): string =>
                '"' . str_replace('"', '""', $identifier) . '"';

            $qualifiedTable = $quote($table->schema_name) . '.' . $quote($tableName);
            $triggerName = 'td_journal_' . substr(hash('sha256', $tableName), 0, 20);
            $quotedTrigger = $quote($triggerName);
            $arguments = implode(', ', array_map(
                static fn (string $column): string => DB::connection()->getPdo()->quote($column),
                $columns,
            ));

            DB::unprepared("DROP TRIGGER IF EXISTS {$quotedTrigger} ON {$qualifiedTable}");
            DB::unprepared(
                "CREATE TRIGGER {$quotedTrigger} AFTER INSERT OR UPDATE OR DELETE ON {$qualifiedTable} " .
                "FOR EACH ROW EXECUTE FUNCTION public.type_drift_capture_change({$arguments})"
            );
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        $tables = DB::select(<<<'SQL'
            SELECT ns.nspname AS schema_name, tbl.relname AS table_name
            FROM pg_class tbl
            JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
            WHERE ns.nspname = 'public'
              AND tbl.relkind = 'r'
              AND tbl.relname NOT IN ('type_drift_change_journal', 'migrations')
              AND EXISTS (
                  SELECT 1
                  FROM pg_trigger trg
                  WHERE trg.tgrelid = tbl.oid
                    AND trg.tgname LIKE 'td_journal_%'
                    AND NOT trg.tgisinternal
              )
        SQL);

        $quote = static fn (string $identifier): string =>
            '"' . str_replace('"', '""', $identifier) . '"';

        foreach ($tables as $table) {
            $qualifiedTable = $quote($table->schema_name) . '.' . $quote($table->table_name);
            $triggers = DB::select(
                "SELECT tgname FROM pg_trigger WHERE tgrelid = ?::regclass AND tgname LIKE 'td_journal_%' AND NOT tgisinternal",
                [$qualifiedTable],
            );

            foreach ($triggers as $trigger) {
                DB::unprepared('DROP TRIGGER IF EXISTS ' . $quote($trigger->tgname) . ' ON ' . $qualifiedTable);
            }
        }

        DB::unprepared('DROP FUNCTION IF EXISTS public.type_drift_capture_change()');
        Schema::dropIfExists('type_drift_change_journal');
    }
};
