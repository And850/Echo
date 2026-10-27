const express = require("express");

const pool = require("../db");
const router = express.Router();
const { requireLogin, requireStudent } = require("../middleware/auth");

router.put("/proposals/:id/vote", requireLogin, requireStudent, async (req, res) => {
    const proposalId = req.params.id;
    const proposalIdPattern = /^[1-9][0-9]*$/;
    if(!proposalIdPattern.test(proposalId) || parseInt(proposalId) < 0) {
        return res.status(400).json({ error: "Proposal ID must be a positive number" });
    }

    const value = req.body.value;
    if (value !== 1 && value !== -1) {
        return res.status(400).json({ error: "Vote value must be either 1 (upvote) or -1 (downvote)" });
    }

    const checkProposalQuery = "SELECT user_id FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }
    else if (proposalResult.rows[0].user_id === req.session.user.id) {
        return res.status(403).json({ error: "You cannot vote on your own proposal" });
    }

    const upsertVoteQuery = `
        INSERT INTO votes (user_id, proposal_id, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, proposal_id)
        DO UPDATE SET value = EXCLUDED.value
        `;
    await pool.query(upsertVoteQuery, [req.session.user.id, proposalId, value]);

    const getNetScoreQuery = "SELECT COALESCE(SUM(value), 0) AS net_score FROM votes WHERE proposal_id = $1";
    const netScoreResult = await pool.query(getNetScoreQuery, [proposalId]);
    const netScore = netScoreResult.rows[0].net_score;

    return res.status(200).json({ net_score: netScore, my_vote: value });
});

router.delete("/proposals/:id/vote", requireLogin, requireStudent, async (req, res) => {
    const proposalId = req.params.id;
    const proposalIdPattern = /^[1-9][0-9]*$/;
    if(!proposalIdPattern.test(proposalId) || parseInt(proposalId) < 0) {
        return res.status(400).json({ error: "Proposal ID must be a positive number" });
    }

    const checkProposalQuery = "SELECT user_id FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }
    else if (proposalResult.rows[0].user_id === req.session.user.id) {
        return res.status(403).json({ error: "You cannot remove your vote on your own proposal" });
    }

    const deleteVoteQuery = "DELETE FROM votes WHERE user_id = $1 AND proposal_id = $2";
    await pool.query(deleteVoteQuery, [req.session.user.id, proposalId]);

    const getNetScoreQuery = "SELECT COALESCE(SUM(value), 0) AS net_score FROM votes WHERE proposal_id = $1";
    const netScoreResult = await pool.query(getNetScoreQuery, [proposalId]);
    const netScore = netScoreResult.rows[0].net_score;

    return res.status(200).json({ net_score: netScore, my_vote: 0 });
});

module.exports = router;    