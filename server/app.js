const express = require("express");

const express_session = require("express-session");

const app = express();

app.use(express_session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false
    }
}));

const authRoutes = require("./routes/auth");

app.use(express.json());
app.use("/api", authRoutes);

app.get("/", (req, res) => {
  res.send("Echo backend is running");
});

module.exports = app;