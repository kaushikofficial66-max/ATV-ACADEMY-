import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/**
 * One counted progress event (recorded video play or live class join).
 * SUM(increment_percent) per enrollment = automatic course progress (capped).
 */
export class ProgressActivity extends Model {}

ProgressActivity.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    activity_type: {
      type: DataTypes.ENUM('video_play', 'live_class_join'),
      allowNull: false
    },
    reference_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    increment_percent: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0
    },
    progress_after: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0
    }
  },
  {
    sequelize,
    tableName: 'progress_activities',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default ProgressActivity;
