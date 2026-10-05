import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class LiveClassParticipant extends Model {}

LiveClassParticipant.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    live_class_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    left_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    attendance_status: {
      type: DataTypes.ENUM('registered', 'joined', 'absent'),
      defaultValue: 'registered'
    }
  },
  {
    sequelize,
    tableName: 'live_class_participants',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default LiveClassParticipant;
