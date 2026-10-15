import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class LiveClass extends Model {}

LiveClass.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    tutor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    // The module (topic) the class is placed in and its "live class" lecture (students see both)
    section_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    lecture_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    scheduled_start: {
      type: DataTypes.DATE,
      allowNull: false
    },
    scheduled_end: {
      type: DataTypes.DATE,
      allowNull: false
    },
    timezone: {
      type: DataTypes.STRING(100),
      defaultValue: 'UTC'
    },
    zoom_meeting_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    zoom_join_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    zoom_start_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'live', 'completed', 'cancelled'),
      defaultValue: 'scheduled'
    },
    // Automatic Zoom cloud recording -> Vimeo (see services/liveClassRecordingService.js)
    recording_status: {
      type: DataTypes.ENUM('none', 'pending', 'uploading', 'uploaded', 'failed'),
      allowNull: false,
      defaultValue: 'none'
    },
    recording_video_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    recording_attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
    },
    recording_error: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    recording_checked_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'live_classes',
    timestamps: true,
    underscored: true
  }
);

export default LiveClass;
