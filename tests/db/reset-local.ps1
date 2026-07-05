param(
    [string] $DatabaseUrl = $env:TEST_DATABASE_URL
)

if (-not $DatabaseUrl) {
    $DatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
}

psql $DatabaseUrl -v ON_ERROR_STOP=1 -f tests/db/schema.current.sql
psql $DatabaseUrl -v ON_ERROR_STOP=1 -f tests/db/seed.sql
