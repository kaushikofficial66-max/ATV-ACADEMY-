import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CourseTutor extends Model {}

CourseTutor.init(
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
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  },
  {
    sequelize,
    tableName: 'course_tutors',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default CourseTutor;
