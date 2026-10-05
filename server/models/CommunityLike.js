import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CommunityLike extends Model {}

CommunityLike.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    post_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'community_likes',
    timestamps: true,
    updatedAt: false,
    underscored: true
  }
);

export default CommunityLike;
