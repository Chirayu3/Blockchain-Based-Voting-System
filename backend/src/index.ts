import "dotenv/config";
import { createConnection } from "typeorm";
import app from "./server";

const requiredEnv = [
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "OTP_HASH_SECRET",
  "DB_PASSWORD",
];

for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.warn(`[WARNING] Environment variable ${envVar} is not defined!`);
    if (process.env.NODE_ENV === "production") {
      console.error(
        `[FATAL] Missing required production environment variable: ${envVar}`
      );
      process.exit(1);
    }
  }
}

const port = process.env.PORT || 8000;

createConnection()
  .then(async () => {
    app.listen(port, () => console.log(`Listening on port ${port}...`));
  })
  .catch((error) => console.error("Database connection failed:", error));
