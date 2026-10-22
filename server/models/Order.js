import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Order extends Model {}

Order.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    order_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    // 'woocommerce' = mirror of an order placed on the WooCommerce store (the
    // commerce source of truth); 'lms' = legacy order created by LMS checkout.
    source: {
      type: DataTypes.ENUM('lms', 'woocommerce', 'website'),
      defaultValue: 'lms'
    },
    // 'website' orders: the antarikshtv.com order id (unique -> replayed pushes never duplicate).
    external_order_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true
    },
    woocommerce_order_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      unique: true
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    discount_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    tax_amount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    total_amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'INR'
    },
    coupon_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    coupon_codes: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'failed', 'cancelled', 'refunded'),
      defaultValue: 'pending'
    },
    woocommerce_status: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    woocommerce_modified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    // Billing details from the checkout (GST invoice) and the invoice itself.
    billing_name: { type: DataTypes.STRING(200), allowNull: true },
    billing_state: { type: DataTypes.STRING(100), allowNull: true },
    billing_state_code: { type: DataTypes.STRING(5), allowNull: true },
    billing_city: { type: DataTypes.STRING(100), allowNull: true },
    billing_postcode: { type: DataTypes.STRING(12), allowNull: true },
    invoice_number: { type: DataTypes.STRING(40), allowNull: true, unique: true },
    invoice_issued_at: { type: DataTypes.DATE, allowNull: true },
    invoice_sent_at: { type: DataTypes.DATE, allowNull: true },
    sync_note: {
      type: DataTypes.STRING(500),
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'orders',
    timestamps: true,
    underscored: true
  }
);

export default Order;
