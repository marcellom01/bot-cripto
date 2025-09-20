module.exports = (sequelize, DataTypes) => {
  return sequelize.define('Trade', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    pair: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    orderId: {
      type: DataTypes.BIGINT,
      allowNull: false,
      unique: true,
    },
    entry_price: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED', 'CLOSED_MANUALLY'),
      allowNull: false,
      defaultValue: 'OPEN',
    },
    exit_price: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: true,
    },
    profit_loss: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: true,
    },
  }, {
    tableName: 'trades',
    timestamps: true,
    indexes: [
      { fields: ['pair'] },
      { fields: ['status'] },
    ],
  });
};
