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


router.get("/proposals/:id/comments", requireLogin, async (req, res) => {
    // as usual, validate the proposal ID
    const proposalId = req.params.id;
    const proposalIdPattern = /^[1-9][0-9]*$/;
    if(!proposalIdPattern.test(proposalId) || parseInt(proposalId) < 0) {
        return res.status(400).json({ error: "Proposal ID must be a positive number" });
    }

    //check if the proposal exists
    const checkProposalQuery = "SELECT id FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }

    //get the comments for the proposal, to be more exact get the id body and craetedat
    const getCommentsQuery = "SELECT c.id, c.body, c.created_at FROM comments c WHERE c.proposal_id = $1 ORDER BY c.created_at ASC, id ASC";
    const commentsResult = await pool.query(getCommentsQuery, [proposalId]);


    //also fetch the replies
    const getRepliesQuery = "SELECT r.id, r.comment_id, r.body, r.created_at FROM replies r WHERE r.comment_id IN (SELECT id FROM comments WHERE proposal_id = $1) ORDER BY r.created_at ASC, id ASC";
    const repliesResult = await pool.query(getRepliesQuery, [proposalId]);

    //combine the comments and replies into a single structure, and not return the redundant comment_id in replies
    const commentsWithReplies = commentsResult.rows.map(comment => {
        return {
            ...comment,
            replies: repliesResult.rows.filter(reply => reply.comment_id === comment.id).map(reply => {
                const { comment_id, ...replyData } = reply;
                return replyData;
            })
        };
    });    

    return res.status(200).json(commentsWithReplies);
});

//only the proposals owner can reply
router.post("/comments/:id/replies", requireLogin, requireStudent, async (req, res) => {
    //validate the comment ID
    const commentId = req.params.id;
    const commentIdPattern = /^[1-9][0-9]*$/;
    if(!commentIdPattern.test(commentId) || parseInt(commentId) < 0) {
        return res.status(400).json({ error: "Comment ID must be a positive number" });
    }

    //validate the reply content
    let content = req.body.body;
    if (typeof content !== "string") {
        return res.status(400).json({ error: "Reply body must be a string" });
    }
    content = content.trim();
    if(content.length < 10 || content.length > 2000) {
        return res.status(400).json({ error: "Reply body must be between 10 and 2000 characters long" });
    }

    //check if the comment exists and get the proposal id
    const checkCommentQuery = "SELECT proposal_id FROM comments WHERE id = $1";
    const commentResult = await pool.query(checkCommentQuery, [commentId]);
    if (commentResult.rows.length === 0) {
        return res.status(404).json({ error: "Comment not found" });
    }
    const proposalId = commentResult.rows[0].proposal_id;

    //check if the current user is the owner of the proposal
    const checkProposalOwnerQuery = "SELECT user_id FROM proposals WHERE id = $1";
    const proposalResult = await pool.query(checkProposalOwnerQuery, [proposalId]);
    if (proposalResult.rows.length === 0) {
        return res.status(404).json({ error: "Proposal not found" });
    }
    if (proposalResult.rows[0].user_id !== req.session.user.id) {
        return res.status(403).json({ error: "You can only reply to comments on your own proposals" });
    }

    //insert the reply into the database
    const insertReplyQuery = "INSERT INTO replies (comment_id, user_id, body, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, body, created_at";
    const replyResult = await pool.query(insertReplyQuery, [commentId, req.session.user.id, content]);

    return res.status(201).json(replyResult.rows[0]);
});

module.exports = router;