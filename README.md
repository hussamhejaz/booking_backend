# booking_backend

## Database migrations

Run the SQL files under `supabase/migrations` in your Supabase project (SQL
editor or CLI) so backend features have the tables they expect.

### Notifications

`supabase/migrations/202402190001_create_notifications_table.sql` creates the
`public.notifications` table linked to `salons` with unread/read tracking. Apply
it before using `/api/owner/notifications`.

`supabase/migrations/202402190005_add_booking_relations_to_notifications.sql`
adds optional `booking_id` and `home_service_booking_id` references so each
notification can point at the related booking record.

### Manual booking slots

`supabase/migrations/202402190002_create_salon_time_slots.sql` adds
`public.salon_time_slots`, which stores owner-defined slot times per day of the
week. After running it, owners can create the hours they want to offer, and the
`/api/owner/availability/slots` endpoint will prefer those manual slots (falling
back to `working_hours` intervals when none are defined).

Use the owner API to manage slots:

- `GET /api/owner/time-slots` – view all manual slots (grouped by day).
- `PUT /api/owner/time-slots` – body `{ day_of_week: 0-6, slots: [{ slot_time: "10:00", duration_minutes?: number, is_active?: boolean }] }` replaces that day's slots.
- `DELETE /api/owner/time-slots/:slotId` – remove a specific slot.

### Service-specific slots

`supabase/migrations/202402190003_create_service_time_slots.sql` enables per-service slot definitions.

- Include a `slots` array when creating/updating a service via `/api/owner/sections/:sectionId/services` or `/api/owner/services/:serviceId`.
- Manage slots later with:
  - `GET /api/owner/services/:serviceId/slots`
  - `PUT /api/owner/services/:serviceId/slots` (body `{ slots: [...] }`)
  - `DELETE /api/owner/services/:serviceId/slots/:slotId`

When service slots exist, `/api/owner/availability/slots` prefers them, falling back to salon-level slots and finally working hours if none are defined.

### Home-service slots

`supabase/migrations/202402190004_create_home_service_time_slots.sql` mirrors the service slot feature for home services.

- Include a `slots` array when calling the home-service create/update endpoints (`/api/owner/home-services`).
- Manage afterwards through:
  - `GET /api/owner/home-services/:serviceId/slots`
  - `PUT /api/owner/home-services/:serviceId/slots`
  - `DELETE /api/owner/home-services/:serviceId/slots/:slotId`

Availability requests (`/api/owner/availability/slots` and the public booking availability) now prioritize home-service slots, then salon-level slots, then working hours.

### Public availability API

`GET /api/public/:salonId/hours` returns available slots for a given date, optionally scoped to a specific `service_id` or `home_service_id`. Query params:

- `date` (required, `YYYY-MM-DD`)
- `service_id` (optional)
- `home_service_id` (optional)
- `type` (`salon` or `home`, inferred from provided IDs if omitted)

The response mirrors the owner availability output, exposing the slot strategy, working-hour window, and slot counts so public clients can show users the same set of available times.
