<?php

// Child process for the manually-triggered staging crash-recovery drill.
// The workflow intentionally SIGKILLs this process after it emits its lease/backend IDs.
require dirname(__DIR__, 2).'/vendor/autoload.php';

$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Support\Database\WriterLeaseManager;
use Illuminate\Support\Facades\DB;

config([
    'database_failover.enabled' => true,
    'database_failover.control_url' => rtrim((string) getenv('LIVE_WRITER_CONTROL_URL'), '/'),
    'database_failover.control_token' => (string) getenv('LIVE_WRITER_CONTROL_TOKEN'),
    'database_failover.neon_url' => (string) getenv('LIVE_DB_URL_NEON'),
    'database_failover.supabase_url' => (string) getenv('LIVE_DB_URL_SUPABASE'),
]);

$manager = app(WriterLeaseManager::class);
$lease = $manager->acquire();
DB::beginTransaction();
$connection = DB::selectOne('SELECT pg_backend_pid() AS pid, current_database() AS database_name');

echo json_encode([
    'lease_id' => $lease['leaseId'],
    'writer' => $lease['writer'],
    'epoch' => $lease['epoch'],
    'backend_pid' => (int) $connection->pid,
    'database_name' => $connection->database_name,
], JSON_THROW_ON_ERROR).PHP_EOL;
flush();

// Keep both the lease and an open PostgreSQL transaction alive until SIGKILL.
while (true) {
    sleep(1);
}
