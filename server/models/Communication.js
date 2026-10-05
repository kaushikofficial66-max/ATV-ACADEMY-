import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Communication extends Model {}

Communication.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    sender_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    recipient_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    recipient_type: {
      type: DataTypes.ENUM('student', 'tutor', 'all_students', 'all_tutors', 'all_users'),
      defaultValue: 'student'
    },
    channel: {
      type: DataTypes.ENUM('email', 'whatsapp'),
      defaultValue: 'email'
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('pending', 'sent', 'failed'),
      defaultValue: 'pending'
    },
    provider_message_id: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'communications',
    timestamps: true,
    underscored: true
  }
);

export default Communication;
