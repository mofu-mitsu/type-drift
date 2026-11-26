<?php

namespace Tests\Feature;

use App\Support\Database\WriterLeaseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Runs only against an explicitly configured staging Writer Control Worker.
 * Unlike WriterDatabaseSwitchTest, this test does not fake HTTP responses.
 */
class LiveWriterControlIntegrationTest extends TestCase
{
    public function test_laravel_acquires_and_releases_a_lease_against_the_real_worker(): void
    {
        $controlUrl = (string) env('LIVE_WRITER_CONTROL_URL', '');
        $controlToken = (string) env('LIVE_WRITER_CONTROL_TOKEN', '');
        $neonUrl = (string) env('LIVE_DB_URL_NEON', '');
        $supabaseUrl = (string) env('LIVE_DB_URL_SUPABASE', '');

        if ($controlUrl === '' || $controlToken === '' || $neonUrl === '' || $supabaseUrl === '') {
            $this->markTestSkipped('Live staging Worker URL/token and isolated PostgreSQL URLs are required.');
        }

        self::assertStringStartsWith('https://', $controlUrl, 'Use the deployed HTTPS staging Worker, not a mocked/local URL.');

        config([
            'database_failover.control_url' => rtrim($controlUrl, '/'),
            'database_failover.control_token' => $controlToken,
            'database_failover.neon_url' => $neonUrl,
            'database_failover.supabase_url' => $supabaseUrl,
        ]);

        $manager = app(WriterLeaseManager::class);
        $lease = null;

        try {
            $lease = $manager->acquire();
            self::assertContains($lease['writer'], ['neon', 'supabase']);
            self::assertGreaterThan(0, $lease['epoch']);

            // Force a real database connection through the selected URL.
            $result = DB::selectOne('SELECT current_database() AS database_name, pg_backend_pid() AS backend_pid');
            self::assertNotEmpty($result->database_name);
            self::assertGreaterThan(0, (int) $result->backend_pid);
        } finally {
            if (is_array($lease)) {
                $manager->releaseLease($lease);
            }
        }

        $read = Http::timeout(5)->withToken($controlToken)->post(
            rtrim($controlUrl, '/').'/v1/writer-control',
            ['action' => 'read']
        );
        self::assertSame(200, $read->status(), 'The deployed Worker must respond to a real read request.');
        self::assertSame('stable', $read->json('state.status'));
        self::assertSame(0, $read->json('activeLeaseCount'),
            'The Laravel finally path must release the lease in the real Worker.');
    }
}
