<?php

namespace Tests\Feature;

use App\Support\Database\WriterLeaseManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WriterDatabaseSwitchTest extends TestCase
{
    public function test_writes_are_routed_to_the_selected_isolated_database(): void
    {
        $neonUrl = (string) env('DB_URL_NEON', '');
        $supabaseUrl = (string) env('DB_URL_SUPABASE', '');

        if ($neonUrl === '' || $supabaseUrl === '') {
            $this->markTestSkipped('Dedicated isolated PostgreSQL URLs are required for this integration test.');
        }

        config([
            'database_failover.control_url' => 'https://writer-control.test',
            'database_failover.control_token' => 'test-token',
            'database_failover.neon_url' => $neonUrl,
            'database_failover.supabase_url' => $supabaseUrl,
        ]);

        foreach ([$neonUrl, $supabaseUrl] as $url) {
            config(['database.connections.pgsql.url' => $url]);
            DB::purge('pgsql');
            DB::connection('pgsql')->statement(
                'CREATE TABLE IF NOT EXISTS writer_switch_probe (writer TEXT NOT NULL)'
            );
            DB::connection('pgsql')->statement('TRUNCATE TABLE writer_switch_probe');
        }

        config(['database.connections.pgsql.url' => env('DB_URL', null)]);
        DB::purge('pgsql');

        Http::fake([
            'writer-control.test/v1/writer-control' => Http::sequence()
                ->push(['state' => ['writer' => 'neon', 'epoch' => 1, 'status' => 'stable']], 200)
                ->push(['lease' => ['id' => 'neon-lease'], 'writer' => 'neon', 'epoch' => 1], 201)
                ->push(['released' => true], 200)
                ->push(['state' => ['writer' => 'supabase', 'epoch' => 2, 'status' => 'stable']], 200)
                ->push(['lease' => ['id' => 'supabase-lease'], 'writer' => 'supabase', 'epoch' => 2], 201)
                ->push(['released' => true], 200),
        ]);

        $manager = app(WriterLeaseManager::class);
        $neonLease = $manager->acquire();
        DB::table('writer_switch_probe')->insert(['writer' => 'neon']);
        $manager->releaseLease($neonLease);

        $supabaseLease = $manager->acquire();
        DB::table('writer_switch_probe')->insert(['writer' => 'supabase']);
        $manager->releaseLease($supabaseLease);

        $counts = [];
        foreach (['neon' => $neonUrl, 'supabase' => $supabaseUrl] as $writer => $url) {
            config(['database.connections.pgsql.url' => $url]);
            DB::purge('pgsql');
            $counts[$writer] = DB::connection('pgsql')->table('writer_switch_probe')->pluck('writer')->all();
        }

        self::assertSame(['neon'], $counts['neon']);
        self::assertSame(['supabase'], $counts['supabase']);
    }
}
