import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { jsonColumn } from '../utils/jsonColumn.js';

export class ReportExport extends Model {}

ReportExport.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    generated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    report_type: {
      type: DataTypes.ENUM('student', 'tutor', 'course', 'sales'),
      allowNull: false
    },
    filters: jsonColumn('filters'),
    file_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('processing', 'completed', 'failed'),
      defaultValue: 'processing'
    },
    completed_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'report_exports',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default ReportExport;
