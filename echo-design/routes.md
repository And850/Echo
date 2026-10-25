# Echo API routes

## Shared rules

- Base path: `/api`. Request and response bodies are JSON.
- Session: server-side, kept in server memory. Cookie is `HttpOnly`, `SameSite=Lax` (`Secure` in production).
- Session contents: `{ id, email, role }`, set at sign-up or log-in. Role never changes.
- Error body: `{ "error": "<message>" }`.
- Every route can also return `500 Internal Server Error` (unexpected failure).
- Who may call it:
  - anyone: no session needed (sign-up and log-in only).
  - logged-in: any session.
  - student / staff: a session with that role. The server checks the role from the session before touching the database.
  - original poster: a student whose `users.id` equals the comment's `proposals.user_id`.
- Email rule (SC1):
  - Trimmed and lower-cased.
  - Must match `^[^@\s]+@bfischool\.org$`.
- Role rule (SC1):
  - Local part ends in a digit (`^[^@]*\d@`) → `student`.
  - Anything else → `staff`.
- Password rule (sign-up only):
  - At least 8 characters.
  - At least one letter and at least one digit.
  - Stored as a bcrypt hash in `users.password_hash`.
- Text rules: trimmed length, the same limits as the database CHECKs.
  - Title: 4–100 characters.
  - Description: 4–2000 characters.
  - Comment body: 10–2000 characters.
  - Reply body: 10–2000 characters.
- IDs in paths are positive integers. Any other value → `400`.
- No route returns another user's email or `moderated_by`. Authors are shown only through `is_own`.
- No route returns vote rows. Only `net_score` and the caller's own `my_vote` (SC6).

## Shapes

- `User` = `{ id, email, role }`
- `Proposal` = `{ id, title, description, status, created_at, moderated_at, net_score, my_vote, is_own }`
  - `net_score` = `COALESCE(SUM(votes.value), 0)`.
  - `my_vote` = the caller's `votes.value` (`1`, `-1`), or `null` if the caller has no vote.
  - `is_own` = `true` if the caller is the proposal's original poster.
- `Reply` = `{ id, body, created_at }`
- `Comment` = `{ id, body, created_at, replies: Reply[] }`. Replies are oldest first.

## Routes

| # | Method | Path | Who may call it | Request input | Response (success) | Tables (R = read, W = write) | SC |
|---|--------|------|-----------------|---------------|--------------------|------------------------------|----|
| 1 | POST | `/api/signup` | anyone | body `{ email, password }` | `201` `User`; starts a session (sets cookie) | users R/W | SC1 |
| 2 | POST | `/api/login` | anyone | body `{ email, password }` | `200` `User`; starts a session (sets cookie) | users R | SC1 |
| 3 | POST | `/api/logout` | logged-in | none | `204`; ends the session on the server, clears the cookie | none | SC1 |
| 4 | GET | `/api/me` | logged-in | none | `200` `User` (from the session) | none | SC1 |
| 5 | GET | `/api/proposals` | logged-in | query `status` = `all` \| `pending` \| `approved` \| `denied` (default `all`); `sort` = `date` \| `score` (default `date`); `order` = `asc` \| `desc` (default `desc`) | `200` `Proposal[]`. Ties are broken by `created_at`, then `id`, in the same order. | proposals R, votes R | SC5, SC6 |
| 6 | POST | `/api/proposals` | student | body `{ title, description }` | `201` `Proposal` (status `pending`, `net_score` 0, `my_vote` null, `is_own` true) | proposals W | SC2 |
| 7 | PUT | `/api/proposals/:id/vote` | student (not the original poster) | path `id`; body `{ value }` = `1` \| `-1` | `200` `{ net_score, my_vote }`. Casts a new vote or changes the existing one (upsert on `(user_id, proposal_id)`). | proposals R, votes R/W | SC3, SC6 |
| 8 | DELETE | `/api/proposals/:id/vote` | student (not the original poster) | path `id` | `200` `{ net_score, my_vote: null }`. Retracts the vote. If there is no vote, nothing changes and the result is the same. | proposals R, votes R/W | SC3, SC6 |
| 9 | PATCH | `/api/proposals/:id/status` | staff | path `id`; body `{ status }` = `approved` \| `denied` | `200` `{ id, status, moderated_at }`. Only a `pending` proposal can be moderated; decisions are final. Sets `moderated_by` = caller and `moderated_at` = now(). | proposals R/W | SC4 |
| 10 | GET | `/api/proposals/:id/comments` | logged-in | path `id` | `200` `Comment[]`, oldest first, each with its `replies` | proposals R, comments R, replies R | SC4, SC6 |
| 11 | POST | `/api/proposals/:id/comments` | staff | path `id`; body `{ body }` | `201` `Comment` (`replies: []`) | proposals R, comments W | SC4 |
| 12 | POST | `/api/comments/:id/replies` | original poster | path `id` (comment id); body `{ body }` | `201` `Reply` | comments R, proposals R, replies W | SC4 |

## Error responses per route

- 1 `POST /api/signup`
  - `400` email missing, not `@bfischool.org`, or malformed
  - `400` password missing or doesn't meet the password rule
  - `409` email already registered
- 2 `POST /api/login`
  - `400` email or password missing
  - `401` wrong email or password (one message for both cases)
- 3 `POST /api/logout`
  - `401` not logged in
- 4 `GET /api/me`
  - `401` not logged in
- 5 `GET /api/proposals`
  - `400` invalid `status`, `sort` or `order` value
  - `401` not logged in
- 6 `POST /api/proposals`
  - `400` title or description missing or outside its length limits
  - `401` not logged in
  - `403` not a student
- 7 `PUT /api/proposals/:id/vote`
  - `400` invalid `id`, or `value` is not `1` or `-1`
  - `401` not logged in
  - `403` not a student
  - `403` caller is the proposal's original poster (no voting on your own proposal)
  - `404` proposal not found
- 8 `DELETE /api/proposals/:id/vote`
  - `400` invalid `id`
  - `401` not logged in
  - `403` not a student
  - `403` caller is the proposal's original poster (no voting on your own proposal)
  - `404` proposal not found
- 9 `PATCH /api/proposals/:id/status`
  - `400` invalid `id`, or `status` is not `approved` or `denied`
  - `401` not logged in
  - `403` not staff
  - `404` proposal not found
  - `409` proposal is not `pending` (already approved or denied; decisions are final and cannot be changed)
- 10 `GET /api/proposals/:id/comments`
  - `400` invalid `id`
  - `401` not logged in
  - `404` proposal not found
- 11 `POST /api/proposals/:id/comments`
  - `400` invalid `id`, or body missing or outside 10–2000 characters
  - `401` not logged in
  - `403` not staff
  - `404` proposal not found
- 12 `POST /api/comments/:id/replies`
  - `400` invalid `id`, or body missing or outside 10–2000 characters
  - `401` not logged in
  - `403` not the proposal's original poster (this includes all staff)
  - `404` comment not found
- Second layer (any write route): if a database trigger or CHECK still rejects the write (SQLSTATE `23514`), the route returns `403` for a role/original-poster trigger and `400` for a CHECK.
