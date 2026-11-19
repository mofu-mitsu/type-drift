<?php

namespace Tests\Unit;

use App\Support\Database\WriterLeaseManager;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WriterLeaseManagerTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'database_failover.enabled' => true,
            'database_failover.control_url' => 'https://writer-control.test',
            'database_failover.control_token' => 'test-token',
            'database_failover.neon_url' => '',
            'database_failover.supabase_url' => '',
        ]);
    }

    public function test_acquire_reads_state_then_acquires_epoch_bound_lease(): void
    {
        Http::fake([
            'writer-control.test/v1/writer-control' => Http::sequence()
                ->push(['state' => ['writer' => 'neon', 'epoch' => 7, 'status' => 'stable']], 200)
                ->push(['lease' => ['id' => 'lease-123'], 'writer' => 'neon', 'epoch' => 7], 201)
                ->push(['released' => true], 200),
        ]);

        $manager = app(WriterLeaseManager::class);
        $lease = $manager->acquire();

        self::assertSame('lease-123', $lease['leaseId']);
        self::assertSame('neon', $lease['writer']);
        self::assertSame(7, $lease['epoch']);

        $manager->releaseLease($lease);

        Http::assertSentCount(3);
        Http::assertSent(fn ($request) => $request['action'] === 'acquire'
            && $request['writer'] === 'neon'
            && $request['expectedEpoch'] === 7);
        Http::assertSent(fn ($request) => $request['action'] === 'release'
            && $request['leaseId'] === 'lease-123');
    }

    public function test_acquire_fails_closed_when_control_plane_is_unavailable(): void
    {
        Http::fake(['*' => Http::response(['error' => 'offline'], 503)]);

        $this->expectException(\RuntimeException::class);
        app(WriterLeaseManager::class)->acquire();
    }
}
