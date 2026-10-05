import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class TutorPayout extends Model {}

TutorPayout.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    tutor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'INR'
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    payout_method: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    transaction_reference: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'paid', 'failed', 'cancelled'),
      defaultValue: 'pending'
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'tutor_payouts',
    timestamps: true,
    underscored: true
  }
);

export default TutorPayout;
