import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class PasswordReset extends Model {}

PasswordReset.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    used_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'password_resets',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default PasswordReset;
