<?php

namespace App\\Support\\Database;

use Throwable;

/**
 * Pure policy for deciding when a primary database should be considered unavailable.
 *
 * This class intentionally does not change Laravel's active connection. Connection
 * switching and write replay must be implemented around this policy only after the
 * replication journal and recovery checks are in place.
 */
final class DatabaseFailoverPolicy
{
    public const PRIMARY = 'primary';
    public const SECONDARY = 'secondary';
    public const RECOVERING = 'recovering';

    /**
     * Classify only signals that indicate a database service/quota problem.
     * Ordinary SQL errors (constraint violations, invalid SQL, etc.) must not
     * cause a database switch.
     *
     * @return 'quota'|'transient'|'unrelated'
     */
    public function classify(Throwable $exception): string
    {
        $message = strtolower($exception->getMessage());
        $code = (string) $exception->getCode();

        $quotaSignals = [
            'compute quota exceeded',
            'monthly compute limit',
            'usage limit exceeded',
            'project has exceeded its quota',
            'quota exceeded',
            'billing limit exceeded',
        ];

        foreach ($quotaSignals as $signal) {
            if (str_contains($message, $signal)) {
                return 'quota';
            }
        }

        // PostgreSQL connection exception class (08xxx), server unavailable,
        // startup/shutdown, and too many connections are service-level failures.
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

    /**
     * Return the next state without mutating external state.
     *
     * @param string $currentState One of PRIMARY, SECONDARY, RECOVERING.
     * @param string $signal One of quota, transient, healthy, unrelated.
     * @param int $consecutiveFailures Number of consecutive primary failures.
     * @param int $consecutiveSuccesses Number of consecutive primary health successes.
     * @param bool $cooldownElapsed Whether the minimum failover cooldown has elapsed.
     */
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
            throw new InvalidArgumentException('Unknown database failover state.');
        }

        if ($currentState === self::PRIMARY) {
            if ($signal === 'quota' || ($signal === 'transient' && $consecutiveFailures >= $failureThreshold)) {
                return self::SECONDARY;
            }

            return self::PRIMARY;
        }

        if ($currentState === self::SECONDARY) {
            if ($signal === 'healthy' && $cooldownElapsed) {
                return self::RECOVERING;
            }

            return self::SECONDARY;
        }

        // A recovery probe is not permission to send production writes to Neon.
        // The caller must complete reverse-sync + integrity checks before promotion.
        if ($signal === 'transient' || $signal === 'quota') {
            return self::SECONDARY;
        }

        if ($signal === 'healthy' && $consecutiveSuccesses >= $recoveryThreshold && $cooldownElapsed) {
            return self::PRIMARY;
        }

        return self::RECOVERING;
    }
}
