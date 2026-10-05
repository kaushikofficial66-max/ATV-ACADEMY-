import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class RecordedVideo extends Model {}

RecordedVideo.init(
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
    section_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    lecture_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    uploaded_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    video_url: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    storage_key: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    thumbnail_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    duration_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: 0
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('processing', 'ready', 'failed', 'published', 'unpublished', 'deleted'),
      defaultValue: 'processing'
    },
    // Numeric Vimeo video id (videos are stored on Vimeo; video_url holds the player embed URL)
    vimeo_video_id: {
      type: DataTypes.STRING(32),
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'recorded_videos',
    timestamps: true,
    underscored: true
  }
);

export default RecordedVideo;
