import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CommunityComment extends Model {}

CommunityComment.init(
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
    },
    parent_comment_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('visible', 'hidden', 'deleted'),
      defaultValue: 'visible'
    }
  },
  {
    sequelize,
    tableName: 'community_comments',
    timestamps: true,
    underscored: true
  }
);

export default CommunityComment;
