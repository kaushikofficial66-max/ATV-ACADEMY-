import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Review extends Model {}

Review.init(
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
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    enrollment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    rating: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: false,
      validate: { min: 1, max: 5 }
    },
    review: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending'
    },
    moderated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    moderated_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'reviews',
    timestamps: true,
    underscored: true
  }
);

export default Review;
