-- $Horde: turba/scripts/sql/turba_objects.pgsql.sql,v 1.2.8.3 2005/10/18 12:50:17 jan Exp $
-- You can simply execute this file in your database.
--
-- Run as:
--
-- $ psql -d DATABASE_NAME < turba_objects.pgsql.sql

CREATE TABLE turba_objects (
    object_id VARCHAR(32) NOT NULL,
    owner_id VARCHAR(255) NOT NULL,
    object_type VARCHAR(255) NOT NULL DEFAULT 'Object',
    object_uid VARCHAR(255),
    object_members TEXT,
    object_name VARCHAR(255),
    object_alias VARCHAR(32),
    object_email VARCHAR(255),
    object_homeaddress VARCHAR(255),
    object_workaddress VARCHAR(255),
    object_homephone VARCHAR(25),
    object_workphone VARCHAR(25),
    object_cellphone VARCHAR(25),
    object_fax VARCHAR(25),
    object_title VARCHAR(255),
    object_company VARCHAR(255),
    object_notes TEXT,
    object_pgppublickey TEXT,
    object_smimepublickey TEXT,
    object_freebusyurl VARCHAR(255),

    PRIMARY KEY(object_id)
);

CREATE INDEX turba_owner_idx ON turba_objects (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON turba_objects TO horde;
