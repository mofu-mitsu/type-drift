<?php

return [
    // Intentionally off until Cloudflare is deployed, all writers are integrated,
    // and staging race tests pass. Enabling this in production prematurely can
    // reject mutations or route them to the wrong database.
    'enabled' => (bool) env('DB_WRITER_CONTROL_ENABLED', false),
    'control_url' => env('DB_WRITER_CONTROL_URL', ''),
    'control_token' => env('DB_WRITER_CONTROL_TOKEN', ''),
    'neon_url' => env('DB_URL_NEON', ''),
    'supabase_url' => env('DB_URL_SUPABASE', ''),
];
