import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Cart extends Model { }

Cart.init(
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
    status: {
      type: DataTypes.ENUM('active', 'converted', 'abandoned'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'carts',
    timestamps: true,
    underscored: true
  }
);

export default Cart;
