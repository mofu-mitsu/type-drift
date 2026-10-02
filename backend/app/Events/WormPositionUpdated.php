<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WormPositionUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public array $worm)
    {
    }

    public function broadcastOn(): array
    {
        return [new Channel('worm-beach')];
    }

    public function broadcastAs(): string
    {
        return 'worm.position';
    }

    public function broadcastWith(): array
    {
        return $this->worm;
    }
}
