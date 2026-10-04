<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConsultationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public string $entryId, public string $entryType)
    {
    }

    public function broadcastOn(): array
    {
        return [new Channel('consultations')];
    }

    public function broadcastAs(): string
    {
        return 'consultation.updated';
    }

    public function broadcastWith(): array
    {
        return ['entry_id' => $this->entryId, 'entry_type' => $this->entryType];
    }
}
