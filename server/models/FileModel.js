import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class FileModel extends Model {}

FileModel.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      primaryKey: true,
      autoIncrement: true
    },
    uploaded_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    storage_provider: {
      type: DataTypes.ENUM('local', 'cloudflare_r2', 'vimeo', 'gcs', 'cloudinary'),
      defaultValue: 'local'
    },
    storage_key: {
      type: DataTypes.STRING(1000),
      allowNull: true
    },
    file_url: {
      type: DataTypes.STRING(1000),
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(150),
      allowNull: true
    },
    file_size: {
      type: DataTypes.BIGINT.UNSIGNED,
      defaultValue: 0
    },
    entity_type: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    entity_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('active', 'deleted'),
      defaultValue: 'active'
    }
  },
  {
    sequelize,
    tableName: 'files',
    timestamps: true,
    underscored: true
  }
);

export default FileModel;
