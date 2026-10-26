const express = require("express");

const pool = require("../db");
const router = express.Router();
const { requireLogin, requireStudent } = require("../middleware/auth");

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

    return res.status(200).json({ message: "okay" });

});

module.exports = router;