<?php

namespace App\Support\Database;

use Throwable;

final class DatabaseFailoverPolicy
{
    public const PRIMARY = 'primary';
    public const SECONDARY = 'secondary';
    public const RECOVERING = 'recovering';

    /** @return 'quota'|'transient'|'unrelated' */
    public function classify(Throwable $exception): string
    {
        $message = strtolower($exception->getMessage());
        $code = (string) $exception->getCode();

        foreach ([
            'compute quota exceeded',
            'monthly compute limit',
            'usage limit exceeded',
            'project has exceeded its quota',
            'quota exceeded',
            'billing limit exceeded',
        ] as $signal) {
            if (str_contains($message, $signal)) {
                return 'quota';
            }
        }

        if (
            preg_match('/^08[0-9a-z]{3}$/i', $code) === 1
            || in_array($code, ['57P01', '57P02', '57P03', '53300'], true)
            || str_contains($message, 'could not connect to server')
            || str_contains($message, 'connection refused')
            || str_contains($message, 'connection timed out')
            || str_contains($message, 'server closed the connection')
            || str_contains($message, 'no route to host')
        ) {
            return 'transient';
        }

        return 'unrelated';
    }

    public function nextState(
        string $currentState,
        string $signal,
        int $consecutiveFailures,
        int $consecutiveSuccesses,
        bool $cooldownElapsed,
        int $failureThreshold = 3,
        int $recoveryThreshold = 3,
    ): string {
        if (!in_array($currentState, [self::PRIMARY, self::SECONDARY, self::RECOVERING], true)) {
            throw new \InvalidArgumentException('Unknown database failover state.');
        }

        if ($currentState === self::PRIMARY) {
            if ($signal === 'quota' || ($signal === 'transient' && $consecutiveFailures >= $failureThreshold)) {
                return self::SECONDARY;
            }

            return self::PRIMARY;
        }

        if ($currentState === self::SECONDARY) {
            return $signal === 'healthy' && $cooldownElapsed
                ? self::RECOVERING
                : self::SECONDARY;
        }

        if ($signal === 'transient' || $signal === 'quota') {
            return self::SECONDARY;
        }

        if ($signal === 'healthy' && $consecutiveSuccesses >= $recoveryThreshold && $cooldownElapsed) {
            return self::PRIMARY;
        }

        return self::RECOVERING;
    }
}
