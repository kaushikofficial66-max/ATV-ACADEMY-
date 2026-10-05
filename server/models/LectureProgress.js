import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class LectureProgress extends Model {}

LectureProgress.init(
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
    lecture_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    watched_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    completion_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'lecture_progress',
    timestamps: true,
    underscored: true
  }
);

export default LectureProgress;
