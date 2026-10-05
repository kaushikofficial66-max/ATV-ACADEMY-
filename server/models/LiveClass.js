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
