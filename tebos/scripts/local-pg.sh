#!/bin/sh
# Starts a throwaway local Postgres for `npm run test:db`, creating it on first use.
# Then: PGHOST=/tmp/tebos-pg PGPORT=54329 PGUSER=postgres npm run test:db
set -e
B=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1); D=/tmp/tebos-pgdata; S=/tmp/tebos-pg
if PGHOST=$S PGPORT=54329 psql -U postgres -qAtc "select 1" -d postgres >/dev/null 2>&1; then exit 0; fi
mkdir -p $S $D; chown postgres $S $D
[ -f $D/PG_VERSION ] || su postgres -s /bin/sh -c "$B/initdb -D $D -U postgres --auth=trust" >/dev/null
rm -f $D/postmaster.pid
su postgres -s /bin/sh -c "$B/pg_ctl -D $D -o '-k $S -p 54329 -c listen_addresses=' -l $D/log -w start" >/dev/null
echo "local Postgres ready on $S:54329"
