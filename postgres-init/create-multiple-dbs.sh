#!/bin/bash
set -euo pipefail

for db in $(echo "$POSTGRES_MULTIPLE_DATABASES" | tr ',' ' '); do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -c "CREATE DATABASE $db;"
done
