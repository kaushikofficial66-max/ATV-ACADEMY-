import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Coupon extends Model {}

Coupon.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    discount_type: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      defaultValue: 'percentage'
    },
    discount_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    minimum_order_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    maximum_discount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    },
    usage_limit: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true
    },
    usage_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      defaultValue: 0
    },
    start_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'expired'),
      defaultValue: 'active'
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'coupons',
    timestamps: true,
    underscored: true
  }
);

export default Coupon;
