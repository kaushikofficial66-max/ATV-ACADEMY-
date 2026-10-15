import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class OrderItem extends Model {}

OrderItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    // Set when the line came from a store PLAN (Essential / Pro / Complete); see courseUnlockService.js
    store_plan_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    course_title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    final_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'order_items',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default OrderItem;
