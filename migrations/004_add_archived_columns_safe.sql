-- migrations/004_add_archived_columns_safe.sql
-- Idempotent guard to ensure archive columns exist with correct types/FKs/indexes.

-- Ensure columns exist
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;

-- If archived_by exists but is not uuid, cast it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bookings'
      AND column_name = 'archived_by'
      AND data_type <> 'uuid'
  ) THEN
    ALTER TABLE bookings
      ALTER COLUMN archived_by TYPE uuid USING (archived_by::uuid);
  END IF;
END$$;

-- Recreate FK
ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_archived_by_fkey;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES salon_users(id) ON DELETE SET NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_bookings_archived ON bookings (archived);
CREATE INDEX IF NOT EXISTS idx_bookings_salon_archived ON bookings (salon_id, archived);
