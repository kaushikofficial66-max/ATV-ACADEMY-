import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class VideoProgress extends Model {}

VideoProgress.init(
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
    video_id: {
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
    last_position_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
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
    tableName: 'video_progress',
    timestamps: true,
    underscored: true
  }
);

export default VideoProgress;
