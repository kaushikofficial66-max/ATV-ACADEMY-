import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Setting extends Model {}

Setting.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    setting_key: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true
    },
    setting_value: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    setting_group: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    is_public: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    updated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'settings',
    timestamps: true,
    underscored: true
  }
);

export default Setting;
