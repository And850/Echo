# Echo React pages and components

One page: the feed. No router, no separate proposal page, no "resolved" tab.

## Component tree

- `App`
  - `Header`
    - `AuthPanel`
  - `FeedPage`
    - `FeedControls`
    - `ProposalForm`
    - `ProposalList`
      - `ProposalCard` (one per proposal)
        - `VoteControls`
        - `ModerationControls`
        - `CommentThread`
          - `CommentItem` (one per comment)
            - `ReplyForm`
          - `CommentForm`

## Components

- `App`
  - Calls: `GET /api/me` on load.
    - `200` → logged-in user.
    - `401` → logged out.
  - Shows, logged in: `Header` and `FeedPage`.
  - Shows, logged out: `Header` only (no feed; only school members may access Echo).
  - Holds: the current user (`User` or `null`), which it passes down.
- `Header`
  - Calls: `POST /api/logout`.
  - Shows, logged in: the user's email, their role, and a "Log out" button. Logging out clears the user and hides the feed.
  - Shows, logged out: `AuthPanel`.
- `AuthPanel`
  - Calls:
    - `POST /api/signup`
    - `POST /api/login`
  - Shows:
    - Email and password fields.
    - A switch between "Log in" and "Sign up".
    - Error messages from the server (`400`, `401`, `409`).
  - On success: sets the user in `App`, which then shows the feed.
- `FeedPage`
  - Calls: `GET /api/proposals?status=&sort=&order=`, on load and whenever the controls, the user, or a proposal changes.
  - Rendered only when logged in.
  - Shows:
    - `FeedControls`
    - `ProposalForm` (students only)
    - `ProposalList`
- `FeedControls`
  - Calls: none (it changes `FeedPage`'s query).
  - Shows:
    - Status filter: All / Pending / Approved / Denied.
    - Sort: Date / Score.
    - Order: Ascending / Descending.
- `ProposalForm`
  - Calls: `POST /api/proposals`.
  - Shows:
    - Title field with a counter (4–100).
    - Description field with a counter (4–2000).
    - A "Submit" button.
    - `400` errors from the server.
  - Rendered only when the user's role is `student`.
- `ProposalList`
  - Calls: none.
  - Shows: one `ProposalCard` per proposal, in the order the server returns them.
- `ProposalCard`
  - Calls: none itself. The child components make the calls.
  - Shows, collapsed:
    - title
    - status badge
    - net score
    - created date
  - Shows, expanded (click the card to toggle, in place):
    - description
    - moderated date (if any)
    - `VoteControls`
    - `ModerationControls`
    - `CommentThread`
- `VoteControls`
  - Calls:
    - `PUT /api/proposals/:id/vote` (`{ value: 1 }` or `{ value: -1 }`)
    - `DELETE /api/proposals/:id/vote`
  - Shows: up and down buttons. The button matching `my_vote` is highlighted, and clicking it retracts the vote.
  - Rendered only for students, and not on their own proposal (`is_own` is `true`). Others, including the original poster, see the net score only.
- `ModerationControls`
  - Calls: `PATCH /api/proposals/:id/status` (`approved` or `denied`).
  - Shows: "Approve" and "Deny" buttons.
  - Rendered only for staff, and only while the status is `pending`.
- `CommentThread`
  - Calls: `GET /api/proposals/:id/comments`, when the card first expands and after a comment or reply is posted.
  - Shows:
    - Comments, oldest first, labelled "Staff".
    - Each comment's replies underneath, labelled "Original poster".
    - `CommentForm`
- `CommentItem`
  - Calls: none.
  - Shows:
    - Comment body and date.
    - Its replies (body and date).
    - `ReplyForm`
- `CommentForm`
  - Calls: `POST /api/proposals/:id/comments`.
  - Shows: a comment field with a counter (10–2000) and a "Comment" button.
  - Rendered only for staff.
- `ReplyForm`
  - Calls: `POST /api/comments/:id/replies`.
  - Shows: a reply field with a counter (10–2000) and a "Reply" button.
  - Rendered only when the proposal's `is_own` is `true`.

## Visibility rules (from `User.role` and `Proposal.is_own`)

| Control | Logged out | Student (not OP) | Student (OP) | Staff |
|---|---|---|---|---|
| Feed, filter, sort, expand, comments | no | yes | yes | yes |
| `ProposalForm` | no | yes | yes | no |
| `VoteControls` | no | yes | no (net score only) | no |
| `ModerationControls` (pending only) | no | no | no | yes |
| `CommentForm` | no | no | no | yes |
| `ReplyForm` | no | no | yes | no |

## Current interface differences

- The logged-out login/signup form is below the header rather than inside it; the feed toolbar, student proposal form, and cards follow the logged-in header.
- Proposal descriptions remain visible in collapsed cards, and an explicit View/Hide discussion button toggles the discussion instead of making the whole card clickable.
- Cards currently show the proposal creation date, but do not show moderated dates; comments and replies do not yet show author labels or dates.
