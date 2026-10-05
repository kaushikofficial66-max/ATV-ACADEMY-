import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class ProjectSubmission extends Model {}

ProjectSubmission.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    project_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    student_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    file_url: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: 0
    },
    submission_note: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('submitted', 'under_review', 'approved', 'rejected', 'resubmission_required'),
      defaultValue: 'submitted'
    },
    tutor_feedback: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    reviewed_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    submitted_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'project_submissions',
    timestamps: true,
    createdAt: false,
    underscored: true
  }
);

export default ProjectSubmission;
