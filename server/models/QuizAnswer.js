import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class QuizAnswer extends Model {}

QuizAnswer.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    question_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    answer_text: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    is_correct: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  },
  {
    sequelize,
    tableName: 'quiz_answers',
    timestamps: true,
    underscored: true
  }
);

export default QuizAnswer;
