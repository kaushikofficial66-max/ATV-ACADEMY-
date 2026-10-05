import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';
import { jsonColumn } from '../utils/jsonColumn.js';

export class CmsContent extends Model {}

CmsContent.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    section_key: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT('long'),
      allowNull: true
    },
    image_url: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    data: jsonColumn('data'),
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    },
    updated_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'cms_contents',
    timestamps: true,
    underscored: true
  }
);

export default CmsContent;
