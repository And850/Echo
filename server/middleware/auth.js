function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Login required" });
    }
    next();
}

function requireStudent(req, res, next) {
    if(req.session.user.role !== "student")
        return res.status(403).json({ error: "Student role required" });

    next();
}

function requireStaff(req, res, next) {
    if(req.session.user.role !== "staff")
        return res.status(403).json({ error: "Staff role required" });

    next();
}

module.exports = { requireLogin, requireStudent, requireStaff };