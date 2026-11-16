<?php

namespace Tests\Unit;

use App\Http\Middleware\RequireWriterLease;
use App\Support\Database\WriterLeaseManager;
use Illuminate\Http\Request;
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
        $manager->expects(self::once())->method('acquire')->willThrowException(new \RuntimeException('offline'));

        $middleware = new RequireWriterLease($manager);
        $response = $middleware->handle(Request::create('/api/bottles', 'POST'), fn () => response()->json(['ok' => true]));

        self::assertSame(503, $response->getStatusCode());
        self::assertSame('3', $response->headers->get('Retry-After'));
    }

    public function test_safe_read_methods_do_not_acquire_a_lease(): void
    {
        config(['database_failover.enabled' => true]);
        $manager = $this->createMock(WriterLeaseManager::class);
        $manager->method('enabled')->willReturn(true);
        $manager->expects(self::never())->method('acquire');

        $middleware = new RequireWriterLease($manager);
        $response = $middleware->handle(Request::create('/api/bottles', 'GET'), fn () => response()->json(['ok' => true]));

        self::assertSame(200, $response->getStatusCode());
    }
}
