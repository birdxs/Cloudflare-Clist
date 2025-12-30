-- Migration number: 0001 	 2025-12-30T01:49:06.590Z

-- Add type column to storages table if it doesn't exist
-- Note: This migration has already been applied to the remote database
-- ALTER TABLE storages ADD COLUMN type TEXT NOT NULL DEFAULT 's3';
