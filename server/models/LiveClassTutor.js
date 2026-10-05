import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

/** Tutors assigned to a live class (the host has is_host = true). */
export class LiveClassTutor extends Model {}

LiveClassTutor.init(
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
    tutor_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    is_host: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  },
  {
    sequelize,
    tableName: 'live_class_tutors',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default LiveClassTutor;
