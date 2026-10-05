import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class QuizAttempt extends Model {}

QuizAttempt.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    quiz_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    attempt_number: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 1
    },
    started_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    submitted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    score: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    percentage: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    },
    passed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    status: {
      type: DataTypes.ENUM('started', 'submitted', 'expired'),
      defaultValue: 'started'
    }
  },
  {
    sequelize,
    tableName: 'quiz_attempts',
    timestamps: true,
    underscored: true
  }
);

export default QuizAttempt;
