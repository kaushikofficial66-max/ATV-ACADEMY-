import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Certificate extends Model {}

Certificate.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    certificate_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    approved_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    certificate_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    issue_date: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'issued', 'revoked'),
      defaultValue: 'pending'
    }
  },
  {
    sequelize,
    tableName: 'certificates',
    timestamps: true,
    underscored: true
  }
);

export default Certificate;
