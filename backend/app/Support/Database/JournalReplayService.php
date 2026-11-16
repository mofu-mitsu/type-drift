<?php

namespace App\Support\Database;

use Illuminate\Database\Connection;
use RuntimeException;

/**
 * Bounded replay primitive. Not wired into requests or scheduled jobs.
 *
 * Sequence values are allocated before commit, so event IDs are not a safe
 * durable high-water mark. Pending events are selected by processed_at instead.
 * The current source row is copied, not the historical snapshot, so a delayed
 * event cannot overwrite a newer committed row state.
 */
final class JournalReplayService
{
    public function __construct(
        private readonly Connection $source,
        private readonly Connection $target,
        private readonly string $sourceId,
    ) {
        if ($source->getDriverName() !== 'pgsql' || $target->getDriverName() !== 'pgsql') {
            throw new RuntimeException('Journal replay requires PostgreSQL on both connections.');
        }

        if ($sourceId === '') {
            throw new RuntimeException('A stable source identifier is required.');
        }
    }

    /** @return array{scanned:int, applied:int, already_applied:int} */
    public function replayBatch(int $limit = 100): array
    {
        if ($limit < 1 || $limit > 1000) {
            throw new RuntimeException('Replay batch limit must be between 1 and 1000.');
        }

        $events = $this->source->table('type_drift_change_journal')
            ->whereNull('processed_at')
            ->orderBy('id')
            ->limit($limit)
            ->get(['id', 'table_name', 'operation', 'primary_key']);

        $result = ['scanned' => $events->count(), 'applied' => 0, 'already_applied' => 0];

        foreach ($events as $event) {
            $primaryKey = is_array($event->primary_key)
                ? $event->primary_key
                : json_decode((string) $event->primary_key, true, 512, JSON_THROW_ON_ERROR);

            if (!is_array($primaryKey) || $primaryKey === []) {
                throw new RuntimeException('Journal event has an invalid primary-key payload.');
            }

            $table = (string) $event->table_name;
            $keyColumns = $this->primaryKeyColumns($table);
            if ($keyColumns === [] || array_diff($keyColumns, array_keys($primaryKey)) !== []
                || array_diff(array_keys($primaryKey), $keyColumns) !== []) {
                throw new RuntimeException("Journal primary key does not match the source schema for {$table}.");
            }

            $sourceRow = $this->source->table($table)->where($primaryKey)->first();
            $row = $sourceRow === null ? null : (array) $sourceRow;

            $applied = $this->target->transaction(function () use ($event, $table, $primaryKey, $keyColumns, $row): bool {
                $this->target->select("SELECT set_config('type_drift.replaying', 'on', true)");

                $receiptInserted = $this->target->table('type_drift_sync_receipts')->insertOrIgnore([
                    'source_id' => $this->sourceId,
                    'source_event_id' => (int) $event->id,
                    'table_name' => $table,
                    'operation' => (string) $event->operation,
                ]);

                if ($receiptInserted === 0) {
                    return false;
                }

                if ($row === null) {
                    $this->target->table($table)->where($primaryKey)->delete();
                } else {
                    $this->target->table($table)->upsert([$row], $keyColumns);
                }

                return true;
            });

            // If this acknowledgement fails after target commit, retry is safe:
            // the destination receipt turns the next attempt into a no-op.
            $this->source->table('type_drift_change_journal')
                ->where('id', (int) $event->id)
                ->whereNull('processed_at')
                ->update(['processed_at' => $this->source->raw('clock_timestamp()')]);

            $result[$applied ? 'applied' : 'already_applied']++;
        }

        return $result;
    }

    /** @return list<string> */
    private function primaryKeyColumns(string $table): array
    {
        if ($table === '' || preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $table) !== 1
            || in_array($table, ['type_drift_change_journal', 'type_drift_sync_receipts', 'type_drift_sync_checkpoints', 'migrations'], true)) {
            throw new RuntimeException('Journal event refers to a disallowed table.');
        }

        $rows = $this->source->select(<<<'SQL'
            SELECT att.attname AS column_name
            FROM pg_index idx
            JOIN pg_class tbl ON tbl.oid = idx.indrelid
            JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
            JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key_column(attnum, ordinality)
                ON key_column.ordinality <= idx.indnkeyatts
            JOIN pg_attribute att ON att.attrelid = tbl.oid AND att.attnum = key_column.attnum
            WHERE idx.indisprimary
              AND ns.nspname = 'public'
              AND tbl.relname = ?
            ORDER BY key_column.ordinality
        SQL, [$table]);

        return array_map(static fn (object $row): string => (string) $row->column_name, $rows);
    }
}
