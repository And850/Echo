-- =====================================================================
-- Echo: school feedback & voting app — PostgreSQL schema
-- =====================================================================

-- ---------------------------------------------------------------------
-- users: everyone who has signed up with a school email.
-- The @bfischool.org domain check and the role assignment from the email
-- are done by the server (decision 4), not here.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY,
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Primary key.
    CONSTRAINT users_pkey PRIMARY KEY (id),
    -- One account per school email (SC1).
    CONSTRAINT users_email_key UNIQUE (email),
    -- Role is limited to the two values the app assigns (SC1).
    CONSTRAINT users_role_check CHECK (role IN ('student', 'staff'))
);

-- ---------------------------------------------------------------------
-- proposals: ideas students submit. Staff moderate them.
-- The net score is NOT stored; it is computed from votes (decision 2).
-- The moderation record lives on the row itself (decision 3).
-- ---------------------------------------------------------------------
CREATE TABLE proposals (
    id           BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id      BIGINT      NOT NULL,
    title        TEXT        NOT NULL,
    description  TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    moderated_by BIGINT,
    moderated_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Primary key.
    CONSTRAINT proposals_pkey PRIMARY KEY (id),
    -- Original poster. Their proposals are deleted along with the account.
    CONSTRAINT proposals_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    -- Staff member who moderated. RESTRICT, because SET NULL would break
    -- proposals_moderation_check on approved/denied rows.
    CONSTRAINT proposals_moderated_by_fkey FOREIGN KEY (moderated_by)
        REFERENCES users (id) ON DELETE RESTRICT,
    -- Title is 4-100 characters; leading/trailing spaces don't count toward the minimum (SC2).
    CONSTRAINT proposals_title_length_check
        CHECK (char_length(btrim(title)) >= 4 AND char_length(title) <= 100),
    -- Description is 4-2000 characters; leading/trailing spaces don't count toward the minimum (SC2).
    CONSTRAINT proposals_description_length_check
        CHECK (char_length(btrim(description)) >= 4 AND char_length(description) <= 2000),
    -- Status is limited to the three lifecycle values (SC2, SC4).
    CONSTRAINT proposals_status_check CHECK (status IN ('pending', 'approved', 'denied')),
    -- Pending: no moderation data. Approved/denied: moderator and time are both set (SC4).
    CONSTRAINT proposals_moderation_check CHECK (
        (status = 'pending'
            AND moderated_by IS NULL AND moderated_at IS NULL)
        OR
        (status IN ('approved', 'denied')
            AND moderated_by IS NOT NULL AND moderated_at IS NOT NULL)
    )
);

-- Filter by status, then sort by creation date (SC5).
CREATE INDEX proposals_status_created_at_idx ON proposals (status, created_at);
-- Sort all proposals by creation date with no status filter (SC5).
CREATE INDEX proposals_created_at_idx ON proposals (created_at);

-- ---------------------------------------------------------------------
-- votes: one up (+1) or down (-1) vote per student per proposal.
-- Changing a vote = UPDATE value. Retracting a vote = DELETE the row (SC3).
-- Rows are never exposed individually by the app (SC6).
-- ---------------------------------------------------------------------
CREATE TABLE votes (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id     BIGINT      NOT NULL,
    proposal_id BIGINT      NOT NULL,
    value       SMALLINT    NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Primary key.
    CONSTRAINT votes_pkey PRIMARY KEY (id),
    -- The voter. Their votes are deleted along with the account.
    CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    -- The proposal voted on. Its votes are deleted along with it.
    CONSTRAINT votes_proposal_id_fkey FOREIGN KEY (proposal_id)
        REFERENCES proposals (id) ON DELETE CASCADE,
    -- At most one vote per user per proposal (SC3).
    CONSTRAINT votes_user_id_proposal_id_key UNIQUE (user_id, proposal_id),
    -- +1 = upvote, -1 = downvote, so SUM(value) is the net score (SC3, SC5).
    CONSTRAINT votes_value_check CHECK (value IN (1, -1))
);

-- Fast per-proposal SUM(value) when computing the net score for sorting (SC5).
CREATE INDEX votes_proposal_id_value_idx ON votes (proposal_id, value);

-- ---------------------------------------------------------------------
-- comments: staff comments on a proposal (SC4).
-- ---------------------------------------------------------------------
CREATE TABLE comments (
    id          BIGINT GENERATED ALWAYS AS IDENTITY,
    proposal_id BIGINT      NOT NULL,
    user_id     BIGINT      NOT NULL,
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Primary key.
    CONSTRAINT comments_pkey PRIMARY KEY (id),
    -- The proposal commented on. Its comments are deleted along with it.
    CONSTRAINT comments_proposal_id_fkey FOREIGN KEY (proposal_id)
        REFERENCES proposals (id) ON DELETE CASCADE,
    -- The staff author. Their comments are deleted along with the account.
    CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    -- Body is 10-2000 characters; leading/trailing spaces don't count toward the minimum.
    CONSTRAINT comments_body_length_check
        CHECK (char_length(btrim(body)) >= 10 AND char_length(body) <= 2000)
);

-- Load a proposal's comments.
CREATE INDEX comments_proposal_id_idx ON comments (proposal_id);

-- ---------------------------------------------------------------------
-- replies: the proposal's original poster replying to a staff comment.
-- Each reply belongs to one comment and one user. Replies do not nest (decision 1).
-- ---------------------------------------------------------------------
CREATE TABLE replies (
    id         BIGINT GENERATED ALWAYS AS IDENTITY,
    comment_id BIGINT      NOT NULL,
    user_id    BIGINT      NOT NULL,
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Primary key.
    CONSTRAINT replies_pkey PRIMARY KEY (id),
    -- The comment replied to. Its replies are deleted along with it.
    CONSTRAINT replies_comment_id_fkey FOREIGN KEY (comment_id)
        REFERENCES comments (id) ON DELETE CASCADE,
    -- The replying user (must be the proposal's OP, see trigger below).
    CONSTRAINT replies_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    -- Body is 10-2000 characters; leading/trailing spaces don't count toward the minimum.
    CONSTRAINT replies_body_length_check
        CHECK (char_length(btrim(body)) >= 10 AND char_length(body) <= 2000)
);

-- Load a comment's replies.
CREATE INDEX replies_comment_id_idx ON replies (comment_id);

-- =====================================================================
-- Role rules that span tables (a CHECK cannot do these), enforced by triggers.
-- =====================================================================

-- Proposals: the author must be a student (SC2). The moderator must be staff (SC4).
CREATE FUNCTION proposals_enforce_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'student') THEN
        RAISE EXCEPTION 'only students can submit proposals (user %)', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.moderated_by IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.moderated_by AND role = 'staff') THEN
        RAISE EXCEPTION 'only staff can moderate proposals (user %)', NEW.moderated_by
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER proposals_enforce_roles_trg
    BEFORE INSERT OR UPDATE OF user_id, moderated_by ON proposals
    FOR EACH ROW EXECUTE FUNCTION proposals_enforce_roles();

-- Votes: only students can vote (SC3).
CREATE FUNCTION votes_enforce_student() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'student') THEN
        RAISE EXCEPTION 'only students can vote (user %)', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER votes_enforce_student_trg
    BEFORE INSERT OR UPDATE OF user_id ON votes
    FOR EACH ROW EXECUTE FUNCTION votes_enforce_student();

-- Votes: a student cannot vote on their own proposal (SC3).
CREATE FUNCTION votes_enforce_not_own() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM proposals WHERE id = NEW.proposal_id AND user_id = NEW.user_id) THEN
        RAISE EXCEPTION 'students cannot vote on their own proposal (user %, proposal %)',
            NEW.user_id, NEW.proposal_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER votes_enforce_not_own_trg
    BEFORE INSERT OR UPDATE OF user_id, proposal_id ON votes
    FOR EACH ROW EXECUTE FUNCTION votes_enforce_not_own();

-- Comments: only staff can comment (SC4).
CREATE FUNCTION comments_enforce_staff() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id AND role = 'staff') THEN
        RAISE EXCEPTION 'only staff can comment (user %)', NEW.user_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER comments_enforce_staff_trg
    BEFORE INSERT OR UPDATE OF user_id ON comments
    FOR EACH ROW EXECUTE FUNCTION comments_enforce_staff();

-- Replies: only the proposal's original poster can reply to its comments (SC4).
CREATE FUNCTION replies_enforce_op() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM comments c
        JOIN proposals p ON p.id = c.proposal_id
        WHERE c.id = NEW.comment_id AND p.user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'only the proposal''s original poster can reply (user %, comment %)',
            NEW.user_id, NEW.comment_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER replies_enforce_op_trg
    BEFORE INSERT OR UPDATE OF user_id, comment_id ON replies
    FOR EACH ROW EXECUTE FUNCTION replies_enforce_op();
