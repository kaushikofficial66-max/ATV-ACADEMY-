import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Course extends Model {}

Course.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    category_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING(300),
      allowNull: false,
      unique: true
    },
    short_description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    thumbnail_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    discount_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    duration_minutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    level: {
      type: DataTypes.ENUM('beginner', 'intermediate', 'advanced', 'all'),
      defaultValue: 'all'
    },
    language: {
      type: DataTypes.STRING(50),
      defaultValue: 'English'
    },
    status: {
      type: DataTypes.ENUM('draft', 'pending', 'approved', 'published', 'rejected', 'archived'),
      defaultValue: 'draft'
    },
    approval_note: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    approved_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'courses',
    timestamps: true,
    underscored: true
  }
);

export default Course;
