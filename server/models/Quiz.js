import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Quiz extends Model {}

Quiz.init(
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
    created_by: {
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
    passing_marks: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0
    },
    total_marks: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.0
    },
    time_limit_minutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true // null = no time limit
    },
    max_attempts: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true // null = unlimited attempts
    },
    status: {
      type: DataTypes.ENUM('draft', 'published', 'inactive'),
      defaultValue: 'draft'
    }
  },
  {
    sequelize,
    tableName: 'quizzes',
    timestamps: true,
    underscored: true
  }
);

export default Quiz;
