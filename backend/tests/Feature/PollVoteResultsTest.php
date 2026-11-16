<?php

namespace Tests\Feature;

use App\Http\Controllers\BottleController;
use App\Models\Bottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class PollVoteResultsTest extends TestCase
{
    private bool $createdPollVotesTable = false;

    protected function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('poll_votes')) {
            Schema::create('poll_votes', function ($table): void {
                $table->id();
                $table->unsignedBigInteger('bottle_id');
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('guest_key')->nullable();
                $table->unsignedInteger('option_index');
                $table->timestamps();
            });
            $this->createdPollVotesTable = true;
        } else {
            DB::table('poll_votes')->delete();
        }
    }

    protected function tearDown(): void
    {
        if ($this->createdPollVotesTable && Schema::hasTable('poll_votes')) {
            Schema::drop('poll_votes');
        }

        parent::tearDown();
    }

    public function test_returns_saved_counts_and_the_current_guests_vote(): void
    {
        DB::table('poll_votes')->insert([
            ['bottle_id' => 7, 'user_id' => null, 'guest_key' => 'guest-a', 'option_index' => 0],
            ['bottle_id' => 7, 'user_id' => null, 'guest_key' => 'guest-b', 'option_index' => 0],
            ['bottle_id' => 7, 'user_id' => null, 'guest_key' => 'guest-c', 'option_index' => 1],
            ['bottle_id' => 8, 'user_id' => null, 'guest_key' => 'guest-a', 'option_index' => 1],
        ]);

        $request = Request::create('/api/bottles/7/votes', 'GET');
        $request->headers->set('X-Guest-Key', 'guest-a');
        $request->setUserResolver(static fn () => null);

        $bottle = (new Bottle())->forceFill(['id' => 7]);
        $response = (new BottleController())->voteResults($request, $bottle);
        $data = $response->getData(true);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(0, (int) $data['myVote']);
        $this->assertSame([
            ['option_index' => 0, 'votes' => 2],
            ['option_index' => 1, 'votes' => 1],
        ], array_map(
            static fn ($row) => ['option_index' => (int) $row['option_index'], 'votes' => (int) $row['votes']],
            $data['counts'],
        ));
    }
}
