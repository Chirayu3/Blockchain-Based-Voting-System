require("dotenv").config();

module.exports = {
  type: "mysql",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  username: process.env.DB_USERNAME || "bbvs",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE || "bbvs",
  synchronize: false,
  logging: process.env.NODE_ENV !== "production",
  cli: {
    migrationsDir: "src/migration",
  },
  entities: ["src/entity/**/*.ts"],
  migrations: ["src/migration/**/*.ts"],
  subscribers: ["src/subscriber/**/*.ts"],
};
