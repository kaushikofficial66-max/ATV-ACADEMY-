import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class CommunityPost extends Model {}

CommunityPost.init(
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
      allowNull: true // can be course-specific or general community
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    attachment_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('published', 'hidden', 'deleted', 'pending'),
      defaultValue: 'published'
    }
  },
  {
    sequelize,
    tableName: 'community_posts',
    timestamps: true,
    underscored: true
  }
);

export default CommunityPost;
