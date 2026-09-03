<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class OAuthController extends Controller
{
    public function redirect(string $provider): RedirectResponse
    {
        $state = Str::random(40);
        session(["oauth_state_{$provider}" => $state]);

        if ($provider === 'google') {
            $query = http_build_query([
                'client_id' => config('services.google.client_id'),
                'redirect_uri' => config('services.google.redirect'),
                'response_type' => 'code',
                'scope' => 'openid email profile',
                'state' => $state,
                'access_type' => 'online',
                'prompt' => 'select_account',
            ]);
            return redirect('https://accounts.google.com/o/oauth2/v2/auth?'.$query);
        }

        if ($provider === 'x') {
            $verifier = Str::random(64);
            session(['oauth_x_verifier' => $verifier]);
            $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
            $query = http_build_query([
                'response_type' => 'code',
                'client_id' => config('services.x.client_id'),
                'redirect_uri' => config('services.x.redirect'),
                'scope' => 'users.read tweet.read offline.access',
                'state' => $state,
                'code_challenge' => $challenge,
                'code_challenge_method' => 'S256',
            ]);
            return redirect('https://twitter.com/i/oauth2/authorize?'.$query);
        }

        abort(404);
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $expected = session()->pull("oauth_state_{$provider}");
        abort_unless($expected && hash_equals($expected, (string) $request->string('state')), 419, 'OAuth state mismatch.');

        try {
            $profile = $provider === 'google'
                ? $this->googleProfile($request->string('code')->toString())
                : $this->xProfile($request->string('code')->toString());

            $user = User::query()->updateOrCreate(
                ['oauth_provider' => $provider, 'oauth_id' => $profile['id']],
                [
                    'name' => $profile['name'],
                    'email' => $profile['email'],
                    'email_verified_at' => now(),
                    'password' => Str::random(40),
                ],
            );
            Auth::login($user, true);
            $request->session()->regenerate();

            return redirect(rtrim(config('app.frontend_url'), '/').'/?login=success');
        } catch (RuntimeException $exception) {
            Log::warning('OAuth callback failed', ['provider' => $provider, 'message' => $exception->getMessage()]);
            return redirect(rtrim(config('app.frontend_url'), '/').'/?login=error');
        }
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()]);
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return response()->json(['ok' => true]);
    }

    private function googleProfile(string $code): array
    {
        $token = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
        ])->throw()->json();
        $profile = Http::withToken($token['access_token'])->get('https://openidconnect.googleapis.com/v1/userinfo')->throw()->json();
        return [
            'id' => (string) $profile['sub'],
            'name' => $profile['name'] ?? '匿名の観測者',
            'email' => $profile['email'],
        ];
    }

    private function xProfile(string $code): array
    {
        $token = Http::asForm()->withBasicAuth(config('services.x.client_id'), config('services.x.client_secret'))
            ->post('https://api.x.com/2/oauth2/token', [
                'code' => $code,
                'grant_type' => 'authorization_code',
                'redirect_uri' => config('services.x.redirect'),
                'code_verifier' => session()->pull('oauth_x_verifier'),
            ])->throw()->json();
        $profile = Http::withToken($token['access_token'])->get('https://api.x.com/2/users/me?user.fields=name,username')->throw()->json('data');
        return [
            'id' => (string) $profile['id'],
            'name' => $profile['name'] ?? $profile['username'] ?? '匿名の観測者',
            'email' => 'x_'.$profile['id'].'@users.type-drift.local',
        ];
    }
}
