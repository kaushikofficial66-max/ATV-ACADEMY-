import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { jsonColumn } from '../utils/jsonColumn.js';

export class Payment extends Model {}

Payment.init(
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
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    payment_gateway: {
      type: DataTypes.STRING(50),
      defaultValue: 'razorpay'
    },
    gateway_order_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    gateway_payment_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    gateway_signature: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'INR'
    },
    status: {
      type: DataTypes.ENUM('created', 'pending', 'success', 'failed', 'refunded'),
      defaultValue: 'created'
    },
    payment_method: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    raw_response: jsonColumn('raw_response')
  },
  {
    sequelize,
    tableName: 'payments',
    timestamps: true,
    underscored: true
  }
);

export default Payment;
