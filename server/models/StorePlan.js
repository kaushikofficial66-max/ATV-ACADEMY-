import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/**
 * A plan sold in the store: ONE WooCommerce product that unlocks several courses
 * (see database/migrations/012_store_plans.sql and services/storePlanService.js).
 */
export class StorePlan extends Model {}

StorePlan.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(500), allowNull: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
    woocommerce_product_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, unique: true },
    woocommerce_product_status: { type: DataTypes.STRING(20), allowNull: true },
    woocommerce_sync_error: { type: DataTypes.STRING(500), allowNull: true }
  },
  { sequelize, tableName: 'store_plans', timestamps: true, underscored: true }
);

export default StorePlan;
