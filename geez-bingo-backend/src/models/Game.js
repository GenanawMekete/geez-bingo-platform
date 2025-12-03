const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  gameId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('waiting', 'active', 'completed', 'cancelled'),
    defaultValue: 'waiting'
  },
  pot: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  calledNumbers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  currentCalls: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  winnerId: {
    type: DataTypes.UUID,
    allowNull: true
  },
  winningCard: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  startTime: {
    type: DataTypes.DATE,
    allowNull: false
  },
  endTime: {
    type: DataTypes.DATE,
    allowNull: true
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {
      betAmount: 10,
      houseFee: 0.05,
      gameDuration: 180000,
      maxCardsPerPlayer: 5
    }
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['gameId'] },
    { fields: ['status'] },
    { fields: ['startTime'] }
  ]
});

module.exports = Game;
