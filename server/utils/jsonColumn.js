import { DataTypes } from 'sequelize';

/**
 * Column definition for the schema's JSON columns. MySQL 8 returns JSON
 * columns already parsed while MariaDB stores them as LONGTEXT strings, so
 * values are (de)serialised here to always expose plain objects/arrays.
 */
export const jsonColumn = (field) => ({
  type: DataTypes.TEXT('long'),
  allowNull: true,
  get() {
    const raw = this.getDataValue(field);
    if (raw === null || raw === undefined || typeof raw !== 'string') return raw ?? null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  set(value) {
    this.setDataValue(field, value === null || value === undefined ? null : typeof value === 'string' ? value : JSON.stringify(value));
  }
});

export default jsonColumn;
