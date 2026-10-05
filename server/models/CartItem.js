import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CartItem extends Model {}

CartItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    cart_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'cart_items',
    timestamps: true,
    underscored: true
  }
);

export default CartItem;
