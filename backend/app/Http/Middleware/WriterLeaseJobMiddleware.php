<?php

namespace App\Http\Middleware;

use App\Support\Database\WriterLeaseManager;
use Closure;
use RuntimeException;

/**
 * Attach to each ShouldQueue job that writes to the database.
 * No queued job classes currently exist in this repository; keep this middleware
 * on any future DB-mutating job and do not rely on HTTP middleware for workers.
 */
final class WriterLeaseJobMiddleware
{
    public function __construct(private readonly WriterLeaseManager $leases)
    {
    }

    public function handle(object $job, Closure $next): mixed
    {
        if (!$this->leases->enabled()) {
            return $next($job);
        }

        $lease = $this->leases->acquire();

        try {
            return $next($job);
        } finally {
            $this->leases->releaseLease($lease);
        }
    }
}
