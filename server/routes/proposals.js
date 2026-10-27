const express = require("express");

const pool = require("../db");
const router = express.Router();
const { requireLogin, requireStudent, requireStaff } = require("../middleware/auth");

router.post("/proposals", requireLogin, requireStudent, async (req, res) => {
    let title = req.body.title;
    let description = req.body.description;

    if (typeof title !== "string" || typeof description !== "string") {
        return res.status(400).json({ error: "Title and description must be strings" });
    }

    title = title.trim();
    description = description.trim();

    if(title.length < 4 || title.length >100)
        return res.status(400).json( { error: "Title must be between 4 and 100 characters long" });

    if(description.length < 4 || description.length > 2000)
        return res.status(400).json( { error: "Description must be between 4 and 2000 characters long" });

    
    const newProposalQuery = "INSERT INTO proposals (title, description, user_id) VALUES ($1, $2, $3) RETURNING id, title, description, status, created_at";
    let queryResult;
    
    queryResult = await pool.query(newProposalQuery, [title, description, req.session.user.id]);
    
    return res.status(201).json(queryResult.rows[0]);
});

router.get("/proposals", requireLogin, async (req, res) => {
    const getProposalsQuery = "SELECT p.id, title, description, status, p.created_at, p.user_id = $1 AS is_own, COALESCE(SUM(v.value), 0) AS net_score, COALESCE(SUM(v.value) FILTER (WHERE v.user_id = $1), 0) AS my_vote FROM proposals p LEFT JOIN votes v ON p.id = v.proposal_id GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC";
    const queryResult = await pool.query(getProposalsQuery, [req.session.user.id]);

    return res.status(200).json(queryResult.rows);
});

router.patch("/proposals/:id/status", requireLogin, requireStaff, async (req, res) => {
    //validate the proposal ID
    const proposalId = req.params.id;
    const proposalIdPattern = /^[1-9][0-9]*$/;
    if(!proposalIdPattern.test(proposalId) || parseInt(proposalId) < 0) {
        return res.status(400).json({ error: "Proposal ID must be a positive number" });
    }
    
    //get the new status
    const newStatus = req.body.status;
    if (newStatus !== "approved" && newStatus !== "denied") {
        return res.status(400).json({ error: "Invalid status. Must be either 'approved' or 'denied'" });
    }

    //check the current status of the proposal
    const checkProposalQuery = "SELECT status FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }
    const currentStatus = proposalResult.rows[0].status;
    //if already moderated, then the status cannot be changed
    if (currentStatus !== "pending") {
        return res.status(409).json({ error: "Proposal already moderated" });
    }

    //update the status of the proposal alongside with staff_id who moderated it and the time
    const updateStatusQuery = "UPDATE proposals SET status = $1, moderated_by = $3, moderated_at = NOW() WHERE id = $2 AND status = 'pending' RETURNING id, title, description, status, created_at, moderated_by, moderated_at";
    const updateResult = await pool.query(updateStatusQuery, [newStatus, proposalId, req.session.user.id]);

    //if the update did not affect any rows, it means the proposal was already moderated by another staff member in the meantime
    if (updateResult.rows.length === 0) {
        return res.status(409).json({ error: "Proposal already moderated" });
    }
    else
        return res.status(200).json(updateResult.rows[0]);
});

module.exports = router;