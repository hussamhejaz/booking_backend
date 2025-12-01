-- migrations/003_fix_booking_archived_by_type.sql
-- Align archived_by with salon_users.id (uuid) and restore FK

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_archived_by_fkey;

ALTER TABLE bookings
  ALTER COLUMN archived_by TYPE uuid USING (archived_by::uuid);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_archived_by_fkey
    FOREIGN KEY (archived_by) REFERENCES salon_users(id) ON DELETE SET NULL;
