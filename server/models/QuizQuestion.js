import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class QuizQuestion extends Model {}

QuizQuestion.init(
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
    question: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    question_type: {
      type: DataTypes.ENUM('single', 'multiple', 'true_false'),
      defaultValue: 'single'
    },
    marks: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 1.00
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  },
  {
    sequelize,
    tableName: 'quiz_questions',
    timestamps: true,
    underscored: true
  }
);

export default QuizQuestion;
