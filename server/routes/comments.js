const express = require("express");

const pool = require("../db");
const router = express.Router();
const { requireLogin, requireStudent, requireStaff } = require("../middleware/auth");

router.post("/proposals/:id/comments", requireLogin, requireStaff, async (req, res) => {
    //validate the proposal ID
    const proposalId = req.params.id;
    const proposalIdPattern = /^[1-9][0-9]*$/;
    if(!proposalIdPattern.test(proposalId) || parseInt(proposalId) < 0) {
        return res.status(400).json({ error: "Proposal ID must be a positive number" });
    }

    //validate the comment content
    let content = req.body.body;
    if (typeof content !== "string") {
        return res.status(400).json({ error: "Comment body must be a string" });
    }
    content = content.trim();
    if(content.length < 10 || content.length > 2000) {
        return res.status(400).json({ error: "Comment body must be between 10 and 2000 characters long" });
    }

    //check if the proposal exists
    const checkProposalQuery = "SELECT id FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }

    //insert the comment into the database
    const insertCommentQuery = "INSERT INTO comments (proposal_id, user_id, body) VALUES ($1, $2, $3) RETURNING id, body, created_at";
    const commentResult = await pool.query(insertCommentQuery, [proposalId, req.session.user.id, content]);

    return res.status(201).json(commentResult.rows[0]);
});