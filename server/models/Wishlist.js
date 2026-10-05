import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Wishlist extends Model {}

Wishlist.init(
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
    course_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'wishlists',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default Wishlist;
