import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/** One course inside a store plan. revenue_weight = this course's share of the plan price (relative to the others). */
export class StorePlanCourse extends Model {}

StorePlanCourse.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    plan_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    course_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    revenue_weight: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 1 },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
  },
  { sequelize, tableName: 'store_plan_courses', timestamps: true, createdAt: 'created_at', updatedAt: false, underscored: true }
);

export default StorePlanCourse;
