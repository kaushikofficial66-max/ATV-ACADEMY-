import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Admin override of the upgrade price from one plan to a bigger one (default: price difference). */
export class StorePlanUpgrade extends Model {}

StorePlanUpgrade.init(
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    from_plan_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    to_plan_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
  },
  { sequelize, tableName: 'store_plan_upgrades', timestamps: true, underscored: true }
);

export default StorePlanUpgrade;
