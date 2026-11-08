# Category requests and hand control

`/resident/{id}/speak` uses the same three categories in a simplified speaking
board. The complete first-person sentence is visible before **Say my words**
speaks it in the resident's configured voice. No individual activity or yes/no
tiles appear on this board. Speaking does not submit a staff request.

Open `/resident/marcus/services` (or use **Call staff** on a resident's home).
Choose one or more of Refreshments, Entertainment, and Family, review, then
confirm. Family requests staff help connecting with family. This showcase has
no service submenus and starts no phone calls or emails.

Hand mode uses a mirrored index-fingertip pointer. Turn the camera on, show
your hand, and hold over a button for one second. Move off a button before
selecting it again. The camera stays off when returning to the page; the input
mode and unfinished choices are restored from resident-scoped local storage.
Eye mode uses the existing eye calibration screen. Touch always works.

Run the actions MCP (`python mcp/actions_server.py`) alongside the API and other
MCP servers. `/staff` shows requests and Acknowledge / Complete controls. Both
resident and staff views refresh every five seconds. Storage failures are
reported; they never become pretend successful requests.

For an **existing PostgreSQL database**, apply
`db/migrations/20261108_service_requests.sql` before using this feature. It only
adds the new table. New databases include it in `db/schema.sql` (that file is
the project's destructive reset schema; do not use it for migration).

Without a database, the actions MCP stores requests atomically in a separate
`*.service-requests.json` file beside its configured `IMW_RUNTIME_FILE`. One
actions MCP process owns this seed-mode file. Use PostgreSQL for multiple
actions-server instances. Requests survive restarts. No landmark or video
data is included in request storage.

API additions:

- `POST /service-requests`: `resident_id`, `categories`, `submission_key`,
  `approved: true`. Repeating a key for the same resident and categories returns
  the original request; reusing it for different categories is rejected.
- `GET /service-requests?resident_id=...&status=...`: shared request queue.
- `PATCH /service-requests/{id}`: status `acknowledged`, `completed`, or
  `cancelled`. Sent requests can be acknowledged or cancelled; acknowledged
  requests can be completed or cancelled. Terminal requests cannot be reopened.

These routes inherit the existing demo application's access model. Staff
acknowledgement is an in-app status, not a delivery guarantee to a pager.

Validation: run the service-request API tests, hand-pointer unit tests, and
`web/e2e/services.spec.ts`. Automated camera tests simulate model output; actual
webcam accuracy still needs an on-device check with the resident's camera.
