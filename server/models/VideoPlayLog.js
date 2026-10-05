import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Every recorded-video play, with the device it was watched on. */
export class VideoPlayLog extends Model {}

VideoPlayLog.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    course_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    video_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    lecture_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    device_type: { type: DataTypes.ENUM('mobile', 'tablet', 'desktop', 'unknown'), defaultValue: 'unknown' },
    os: { type: DataTypes.STRING(50), allowNull: true },
    browser: { type: DataTypes.STRING(50), allowNull: true },
    played_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
  },
  {
    sequelize,
    tableName: 'video_play_logs',
    timestamps: false,
    underscored: true
  }
);

export default VideoPlayLog;
