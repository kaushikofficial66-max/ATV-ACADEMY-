import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/** One row per login: device, browser, IP, last activity and logout time. */
export class UserSession extends Model {}

UserSession.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    session_key: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    device_type: { type: DataTypes.ENUM('mobile', 'tablet', 'desktop', 'unknown'), defaultValue: 'unknown' },
    os: { type: DataTypes.STRING(50), allowNull: true },
    browser: { type: DataTypes.STRING(50), allowNull: true },
    ip_address: { type: DataTypes.STRING(45), allowNull: true },
    user_agent: { type: DataTypes.STRING(500), allowNull: true },
    login_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    logout_at: { type: DataTypes.DATE, allowNull: true }
  },
  {
    sequelize,
    tableName: 'user_sessions',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default UserSession;
