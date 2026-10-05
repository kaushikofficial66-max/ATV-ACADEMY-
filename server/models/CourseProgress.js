import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CourseProgress extends Model {}

CourseProgress.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      unique: true
    },
    total_lectures: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    completed_lectures: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    completion_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    last_lecture_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'course_progress',
    timestamps: true,
    underscored: true
  }
);

export default CourseProgress;
