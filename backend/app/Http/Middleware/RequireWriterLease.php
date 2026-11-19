<?php

namespace App\Http\Middleware;

use App\Support\Database\WriterLeaseManager;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

final class RequireWriterLease
{
    public function __construct(private readonly WriterLeaseManager $leases)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        // Lease every API request: even GET routes may update OAuth/session state or counters.
        if (!$this->leases->enabled()) {
            return $next($request);
        }

        try {
            $lease = $this->leases->acquire();
        } catch (Throwable $exception) {
            Log::warning('Mutation denied because a writer lease could not be acquired.', [
                'path' => $request->path(),
                'error' => $exception->getMessage(),
            ]);

            return response()->json([
                'error' => 'writer_unavailable',
                'message' => '書き込み先の切り替え確認中です。少し待ってからもう一度お試しください。',
            ], 503)->header('Retry-After', '3');
        }

        try {
            return $next($request);
        } finally {
            // The lease remains active through inner middleware post-processing,
            // including API session persistence, because this middleware is prepended.
            $this->leases->releaseLease($lease);
        }
    }
}
