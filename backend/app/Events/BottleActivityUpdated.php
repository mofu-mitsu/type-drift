<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BottleActivityUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public int $bottleId, public string $kind)
    {
    }

    public function broadcastOn(): array
    {
        return [new Channel('bottles')];
    }

    public function broadcastAs(): string
    {
        return 'bottle.activity.updated';
    }

    public function broadcastWith(): array
    {
        return ['bottle_id' => $this->bottleId, 'kind' => $this->kind];
    }
}
