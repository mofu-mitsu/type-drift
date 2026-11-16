<?php

namespace Tests\Feature;

use App\Http\Controllers\BottleController;
use App\Models\Bottle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class PollVoteResultsTest extends TestCase
{
    private bool $createdPollVotesTable = false;
    private int $bottleId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bottleId = random_int(1000000, 2000000000);

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
        }
    }

    protected function tearDown(): void
    {
        if ($this->createdPollVotesTable && Schema::hasTable('poll_votes')) {
            Schema::drop('poll_votes');
        }

        parent::tearDown();
    }

    public function test_get_vote_results_route_is_registered(): void
    {
        $route = Route::getRoutes()->match(Request::create('/api/bottles/123/votes', 'GET'));

        $this->assertSame('App\\Http\\Controllers\\BottleController@voteResults', $route->getActionName());
    }

    public function test_returns_saved_counts_and_the_current_guests_vote(): void
    {
        $now = now();
        DB::table('poll_votes')->insert([
            ['bottle_id' => $this->bottleId, 'user_id' => null, 'guest_key' => 'poll-results-guest-a', 'option_index' => 0, 'created_at' => $now, 'updated_at' => $now],
            ['bottle_id' => $this->bottleId, 'user_id' => null, 'guest_key' => 'poll-results-guest-b', 'option_index' => 0, 'created_at' => $now, 'updated_at' => $now],
            ['bottle_id' => $this->bottleId, 'user_id' => null, 'guest_key' => 'poll-results-guest-c', 'option_index' => 1, 'created_at' => $now, 'updated_at' => $now],
        ]);

        $request = Request::create('/api/bottles/'.$this->bottleId.'/votes', 'GET');
        $request->headers->set('X-Guest-Key', 'poll-results-guest-a');
        $request->setUserResolver(static fn () => null);

        $bottle = (new Bottle())->forceFill(['id' => $this->bottleId]);
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
