import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class EmailVerification extends Model {}

EmailVerification.init(
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
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'email_verifications',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default EmailVerification;
