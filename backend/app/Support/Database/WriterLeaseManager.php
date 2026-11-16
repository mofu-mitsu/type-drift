<?php

namespace App\Support\Database;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

final class WriterLeaseManager
{
    public function enabled(): bool
    {
        return (bool) config('database_failover.enabled', false);
    }

    /** @return array{leaseId:string, writer:string, epoch:int, previousDefault:string, previousPgsqlUrl:mixed} */
    public function acquire(): array
    {
        $baseUrl = rtrim((string) config('database_failover.control_url', ''), '/');
        $token = (string) config('database_failover.control_token', '');
        if ($baseUrl === '' || $token === '') {
            throw new RuntimeException('Writer lease control URL/token is missing.');
        }

        $headers = ['Authorization' => 'Bearer '.$token];
        $read = Http::timeout(3)->withHeaders($headers)->post($baseUrl.'/v1/writer-control', ['action' => 'read']);
        if (!$read->successful()) {
            throw new RuntimeException('Writer control read failed with HTTP '.$read->status().'.');
        }

        $state = $read->json('state');
        $writer = is_array($state) ? ($state['writer'] ?? null) : null;
        $epoch = is_array($state) ? ($state['epoch'] ?? null) : null;
        if (!in_array($writer, ['neon', 'supabase'], true) || !is_int($epoch) || $epoch < 1
            || ($state['status'] ?? null) !== 'stable') {
            throw new RuntimeException('Writer control returned an invalid or transitioning state.');
        }

        $acquire = Http::timeout(3)->withHeaders($headers)->post($baseUrl.'/v1/writer-control', [
            'action' => 'acquire', 'writer' => $writer, 'expectedEpoch' => $epoch,
        ]);
        if ($acquire->status() === 409 || $acquire->status() === 423) {
            throw new RuntimeException('Writer changed while acquiring lease; retry the request.');
        }
        $leaseId = $acquire->json('lease.id');
        if ($acquire->status() !== 201 || !is_string($leaseId) || $leaseId === '') {
            throw new RuntimeException('Writer lease acquisition failed with HTTP '.$acquire->status().'.');
        }

        $previousDefault = (string) config('database.default');
        $previousPgsqlUrl = config('database.connections.pgsql.url');
        $writerUrl = $writer === 'supabase'
            ? (string) config('database_failover.supabase_url', '')
            : (string) config('database_failover.neon_url', '');

        if ($writer === 'supabase' && $writerUrl === '') {
            $this->release($leaseId, $baseUrl, $token);
            throw new RuntimeException('Supabase is selected but DB_URL_SUPABASE is not configured.');
        }

        if ($writerUrl !== '') {
            config(['database.connections.pgsql.url' => $writerUrl]);
            app('db')->purge('pgsql');
        }
        config(['database.default' => 'pgsql']);

        return [
            'leaseId' => $leaseId,
            'writer' => $writer,
            'epoch' => $epoch,
            'previousDefault' => $previousDefault,
            'previousPgsqlUrl' => $previousPgsqlUrl,
        ];
    }

    public function releaseLease(array $lease): void
    {
        $baseUrl = rtrim((string) config('database_failover.control_url', ''), '/');
        $token = (string) config('database_failover.control_token', '');
        $this->restoreDatabaseConfig($lease);

        if ($baseUrl === '' || $token === '' || !isset($lease['leaseId'])) {
            Log::critical('Writer lease release skipped due to missing control configuration.');
            return;
        }

        try {
            $response = Http::timeout(3)->withToken($token)->post($baseUrl.'/v1/writer-control', [
                'action' => 'release', 'leaseId' => $lease['leaseId'],
            ]);
            if (!$response->successful()) {
                Log::critical('Writer lease release failed; failover must remain blocked.', [
                    'lease_id' => $lease['leaseId'], 'status' => $response->status(),
                ]);
            }
        } catch (Throwable $exception) {
            Log::critical('Writer lease release request failed; failover must remain blocked.', [
                'lease_id' => $lease['leaseId'], 'error' => $exception->getMessage(),
            ]);
        }
    }

    private function release(string $leaseId, string $baseUrl, string $token): void
    {
        try {
            Http::timeout(3)->withToken($token)->post($baseUrl.'/v1/writer-control', [
                'action' => 'release', 'leaseId' => $leaseId,
            ]);
        } catch (Throwable $exception) {
            Log::critical('Writer lease release failed during connection setup.', [
                'lease_id' => $leaseId, 'error' => $exception->getMessage(),
            ]);
        }
    }

    private function restoreDatabaseConfig(array $lease): void
    {
        app('db')->purge('pgsql');
        config([
            'database.connections.pgsql.url' => $lease['previousPgsqlUrl'] ?? null,
            'database.default' => $lease['previousDefault'] ?? 'pgsql',
        ]);
    }
}
