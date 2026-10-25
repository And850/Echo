const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const router = express.Router();

router.post("/signup", async (req, res) => {
    let email = req.body.email;
    const password = req.body.password;
    let role;

    if(typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({
            error: "Email and password must be strings"
        });
    }
    email = email.trim().toLowerCase();
    const schoolEmailPattern = /^[^\s@]+@bfischool\.org$/;
    if (!schoolEmailPattern.test(email)) {
        return res.status(400).json({
            error: "Use your @bfischool.org email address"
        });
    }

    if(password.length < 8) {
        return res.status(400).json({
            error: "Password must be at least 8 characters long"
        });
    }
    const passwordLetterPattern = /[a-zA-Z]+/;
    const passwordNumberPattern = /[0-9]+/;
    if (!passwordLetterPattern.test(password) || !passwordNumberPattern.test(password)) {
        return res.status(400).json({
            error: "Password must contain at least 1 letter and 1 number"
        });
    }

    const isStudent = passwordNumberPattern.test(email.charAt(email.indexOf("@")-1));
    if (isStudent) {
        role = "student";
    } else {
        role = "staff";
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const registerQuery = "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role";

    try {
        queryResult = await pool.query(registerQuery, [email, passwordHash, role]);
    } catch (error) {
        if (error.code === '23505' && error.constraint === 'users_email_key') { // Unique violation
            return res.status(409).json({
                error: "Email already registered"
            });
        }
        else
            throw error;
    }

    const newUser = queryResult.rows[0];
    req.session.user = newUser;


    res.status(201).json( queryResult.rows[0] );
});

router.get("/me", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Login required" });
    } else {
        return res.status(200).json({ user: req.session.user });
    }
});

router.post("/login", async (req, res) => {

    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    if(typeof email !== "string" || typeof password !== "string") {
        return res.status(400).json({
            error: "Email and password must be strings"
        });
    }

    const userQuery = "SELECT id, email, password_hash, role FROM users WHERE email = $1";
    const queryResult = await pool.query(userQuery, [email]);

    if (queryResult.rows.length === 0) {
        return res.status(401).json({ error: "Incorrect email or password" });
    }

    const user = queryResult.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
        return res.status(401).json({ error: "Incorrect email or password" });
    } else {
        req.session.user = { id: user.id, email: user.email, role: user.role };
        return res.status(200).json({ user: req.session.user });
    }
});

router.post("/logout", (req, res) => {
    if(!req.session.user) {
        return res.status(401).json({ error: "Login required"});
    }

    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({ error: "Logout failed" });
        } else {
            res.clearCookie("connect.sid");
            return res.status(204).end();
        }
    });
});

module.exports = router;