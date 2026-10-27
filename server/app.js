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
const proosalsRoutes = require("./routes/proposals");
const votesRoutes = require("./routes/votes");
const commentsRoutes = require("./routes/comments");

app.use(express.json());
app.use("/api", authRoutes);
app.use("/api", proosalsRoutes);
app.use("/api", votesRoutes);
app.use("/api", commentsRoutes);

app.get("/", (req, res) => {
  res.send("Echo backend is running");
});

module.exports = app;