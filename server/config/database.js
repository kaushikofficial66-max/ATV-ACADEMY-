import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  NODE_ENV,
} = process.env;

/**
 * Sequelize MySQL Database Connection Instance
 */
export const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  port: Number(DB_PORT),
  dialect: 'mysql',
  logging: NODE_ENV === 'development' ? (msg) => console.log(`[DB Query]: ${msg}`) : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
});

/**
 * Connect and authenticate MySQL Database
 */
export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`[Database]: MySQL Connected successfully to "${DB_NAME}" at ${DB_HOST}:${DB_PORT}`);
    return sequelize;
  } catch (error) {
    console.error(`[Database Error]: Failed to connect to MySQL database "${DB_NAME}":`, error.message);
    if (NODE_ENV === 'development') {
      console.error(error);
    }
    // Do not crash the entire process immediately on transient db connection hiccups, but propagate if needed
    return null;
  }
};

export default sequelize;
