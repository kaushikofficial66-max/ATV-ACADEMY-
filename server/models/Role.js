import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Role extends Model {}

Role.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'roles',
    timestamps: true,
    underscored: true
  }
);

export default Role;
