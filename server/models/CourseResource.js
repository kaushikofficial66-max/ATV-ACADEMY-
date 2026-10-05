import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CourseResource extends Model {}

CourseResource.init(
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
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    file_url: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    file_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: 0
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'course_resources',
    timestamps: true,
    underscored: true
  }
);

export default CourseResource;
