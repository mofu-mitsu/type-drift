<?php

namespace Tests\Unit;

use App\Support\Database\DatabaseFailoverPolicy;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class DatabaseFailoverPolicyTest extends TestCase
{
    public function test_quota_error_triggers_immediate_failover_decision(): void
    {
        $policy = new DatabaseFailoverPolicy();

        self::assertSame('quota', $policy->classify(new RuntimeException('Compute quota exceeded for this project')));
        self::assertSame(
            DatabaseFailoverPolicy::SECONDARY,
            $policy->nextState(DatabaseFailoverPolicy::PRIMARY, 'quota', 1, 0, false),
        );
    }

    public function test_transient_connection_error_requires_consecutive_failures(): void
    {
        $policy = new DatabaseFailoverPolicy();

        self::assertSame('transient', $policy->classify(new RuntimeException('could not connect to server')));
        self::assertSame(
            DatabaseFailoverPolicy::PRIMARY,
            $policy->nextState(DatabaseFailoverPolicy::PRIMARY, 'transient', 1, 0, false),
        );
        self::assertSame(
            DatabaseFailoverPolicy::SECONDARY,
            $policy->nextState(DatabaseFailoverPolicy::PRIMARY, 'transient', 3, 0, false),
        );
    }

    public function test_sql_logic_error_does_not_trigger_failover(): void
    {
        $policy = new DatabaseFailoverPolicy();

        self::assertSame('unrelated', $policy->classify(new RuntimeException('SQLSTATE[23505]: unique violation')));
        self::assertSame(
            DatabaseFailoverPolicy::PRIMARY,
            $policy->nextState(DatabaseFailoverPolicy::PRIMARY, 'unrelated', 0, 0, false),
        );
    }

    public function test_secondary_does_not_return_to_primary_without_cooldown_and_recovery_probe(): void
    {
        $policy = new DatabaseFailoverPolicy();

        self::assertSame(
            DatabaseFailoverPolicy::SECONDARY,
            $policy->nextState(DatabaseFailoverPolicy::SECONDARY, 'healthy', 0, 3, false),
        );
        self::assertSame(
            DatabaseFailoverPolicy::RECOVERING,
            $policy->nextState(DatabaseFailoverPolicy::SECONDARY, 'healthy', 0, 1, true),
        );
    }

    public function test_recovery_failure_returns_to_secondary(): void
    {
        $policy = new DatabaseFailoverPolicy();

        self::assertSame(
            DatabaseFailoverPolicy::SECONDARY,
            $policy->nextState(DatabaseFailoverPolicy::RECOVERING, 'transient', 1, 0, true),
        );
    }
}
