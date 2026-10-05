import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class QuizAttemptAnswer extends Model {}

QuizAttemptAnswer.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    attempt_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    question_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    answer_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    answer_text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_correct: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    marks_obtained: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00
    }
  },
  {
    sequelize,
    tableName: 'quiz_attempt_answers',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default QuizAttemptAnswer;
