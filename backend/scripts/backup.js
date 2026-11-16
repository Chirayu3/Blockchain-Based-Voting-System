const mysql = require("mysql");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const conn = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USERNAME || "bbvs",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || "bbvs",
});

conn.connect((err) => {
  if (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  }
  conn.query("SHOW TABLES", async (err, tables) => {
    if (err) {
      console.error("Query error:", err.message);
      process.exit(1);
    }
    const backup = {};
    for (const tableObj of tables) {
      const tableName = Object.values(tableObj)[0];
      const rows = await new Promise((resolve, reject) => {
        conn.query("SELECT * FROM `" + tableName + "`", (e, r) => {
          if (e) reject(e);
          else resolve(r);
        });
      });
      backup[tableName] = rows;
    }
    const backupPath = path.join(
      __dirname,
      "../backup_bbvs_" + Date.now() + ".json"
    );
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log("Database backup completed successfully.");
    console.log("File saved to:", backupPath);
    console.log("Tables backed up:", Object.keys(backup));
    conn.end();
  });
});
