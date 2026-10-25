require("dotenv").config();

const app = require("./app");
const pool = require("./db");

const port = process.env.PORT || 3001;

async function start() {
  try {
    const result = await pool.query("SELECT NOW() AS time");
    console.log("Database connected:", result.rows[0].time);

    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

start();