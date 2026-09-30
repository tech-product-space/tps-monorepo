-- ps-v3 database bootstrap
-- Run this once, after PostgreSQL 17.9 is installed on the EC2 instance,
-- as the postgres superuser (e.g. `sudo -u postgres psql -f init.sql`).

CREATE DATABASE productspace;

\c productspace

-- One schema per backend service
CREATE SCHEMA IF NOT EXISTS tps;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS gradient;

-- Single app role, used by all 3 backends for now.
-- (Per-service roles with schema-scoped grants are a reasonable follow-up
-- once this is stable — not done here to keep the first cutover simple.)
CREATE USER ps_app WITH PASSWORD '__REPLACE_ME__';

GRANT ALL PRIVILEGES ON SCHEMA tps TO ps_app;
GRANT ALL PRIVILEGES ON SCHEMA crm TO ps_app;
GRANT ALL PRIVILEGES ON SCHEMA gradient TO ps_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA tps GRANT ALL ON TABLES TO ps_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT ALL ON TABLES TO ps_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradient GRANT ALL ON TABLES TO ps_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA tps GRANT ALL ON SEQUENCES TO ps_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT ALL ON SEQUENCES TO ps_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gradient GRANT ALL ON SEQUENCES TO ps_app;

-- Each backend sets its own search_path on connect (see config change needed
-- per service, noted in ../PROJECT_README.md) so migrations/queries land in
-- the right schema without every table/model needing to be schema-qualified.
