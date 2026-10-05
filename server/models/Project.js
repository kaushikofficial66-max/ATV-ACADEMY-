import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { jsonColumn } from '../utils/jsonColumn.js';

export class Project extends Model {}

Project.init(
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
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    instructions: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    max_file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: 52428800 // 50MB default
    },
    allowed_file_types: jsonColumn('allowed_file_types'),
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'projects',
    timestamps: true,
    underscored: true
  }
);

export default Project;
