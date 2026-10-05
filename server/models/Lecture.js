import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Lecture extends Model {}

Lecture.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    section_id: {
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
    lecture_type: {
      type: DataTypes.ENUM('video', 'text', 'document', 'quiz', 'live_class'),
      defaultValue: 'video'
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    is_preview: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    duration_seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'inactive'),
      defaultValue: 'draft'
    }
  },
  {
    sequelize,
    tableName: 'lectures',
    timestamps: true,
    underscored: true
  }
);

export default Lecture;
