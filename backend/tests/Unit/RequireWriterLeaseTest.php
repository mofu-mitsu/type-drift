<?php

namespace Tests\Unit;

use App\Http\Middleware\RequireWriterLease;
use App\Support\Database\WriterLeaseManager;
use Illuminate\Http\Request;
use RuntimeException;
use Tests\TestCase;

class RequireWriterLeaseTest extends TestCase
{
    public function test_disabled_lease_guard_does_not_call_control_plane(): void
    {
        config(['database_failover.enabled' => false]);
        $manager = $this->createMock(WriterLeaseManager::class);
        $manager->expects(self::never())->method('acquire');

        $middleware = new RequireWriterLease($manager);
        $response = $middleware->handle(Request::create('/api/bottles', 'POST'), fn () => response()->json(['ok' => true]));

        self::assertSame(200, $response->getStatusCode());
    }

    public function test_mutation_is_denied_when_lease_cannot_be_acquired(): void
    {
        config(['database_failover.enabled' => true]);
        $manager = $this->createMock(WriterLeaseManager::class);
        $manager->method('enabled')->willReturn(true);
        $manager->expects(self::once())->method('acquire')->willThrowException(new RuntimeException('offline'));

        $middleware = new RequireWriterLease($manager);
        $response = $middleware->handle(Request::create('/api/bottles', 'POST'), fn () => response()->json(['ok' => true]));

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('3', $response->headers->get('Retry-After'));
    }

    public function test_get_routes_also_hold_a_lease_for_session_and_oauth_writes(): void
    {
        config(['database_failover.enabled' => true]);
        $manager = $this->createMock(WriterLeaseManager::class);
        $manager->method('enabled')->willReturn(true);
        $manager->expects(self::once())->method('acquire')->willReturn([
            'leaseId' => 'lease-get', 'writer' => 'neon', 'epoch' => 1,
            'previousDefault' => 'sqlite', 'previousPgsqlUrl' => null,
        ]);
        $manager->expects(self::once())->method('releaseLease');

        $middleware = new RequireWriterLease($manager);
        $response = $middleware->handle(Request::create('/api/auth/google/callback', 'GET'), fn () => response()->json(['ok' => true]));

        self::assertSame(200, $response->getStatusCode());
    }

    public function test_lease_is_released_when_downstream_throws(): void
    {
        config(['database_failover.enabled' => true]);
        $manager = $this->createMock(WriterLeaseManager::class);
        $manager->method('enabled')->willReturn(true);
        $manager->expects(self::once())->method('acquire')->willReturn([
            'leaseId' => 'lease-exception', 'writer' => 'neon', 'epoch' => 1,
            'previousDefault' => 'sqlite', 'previousPgsqlUrl' => null,
        ]);
        $manager->expects(self::once())->method('releaseLease');

        $middleware = new RequireWriterLease($manager);

        try {
            $middleware->handle(Request::create('/api/bottles', 'POST'), function () {
                throw new RuntimeException('simulated request failure');
            });
            self::fail('The downstream exception should be rethrown.');
        } catch (RuntimeException $exception) {
            self::assertSame('simulated request failure', $exception->getMessage());
        }
    }
}
