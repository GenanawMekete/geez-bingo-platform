const EventEmitter = require('events');
const Redis = require('redis');
const crypto = require('crypto');

class GameEngine extends EventEmitter {
  constructor() {
    super();
    this.activeGames = new Map();
    this.waitingGames = new Map();
    this.playerSessions = new Map();
    this.cardPool = new Array(400).fill(null).map((_, i) => i + 1);
    this.redisClient = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.redisClient.connect();
  }

  async initialize(io) {
    this.io = io;
    console.log('🎮 Game Engine Initialized');
    
    // Start game cycle
    this.startGameCycle();
    
    // Cleanup old games periodically
    setInterval(() => this.cleanupOldGames(), 5 * 60 * 1000);
  }

  startGameCycle() {
    // Start first game immediately
    this.createNewGame();
    
    // Schedule next games every 30 seconds
    setInterval(() => {
      if (this.waitingGames.size < 5) { // Max 5 waiting games
        this.createNewGame();
      }
    }, 30000); // 30 seconds
  }

  async createNewGame() {
    const gameId = `bingo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const game = {
      id: gameId,
      status: 'waiting',
      players: new Set(),
      cards: new Map(),
      pot: 0,
      calledNumbers: [],
      currentCalls: [],
      startTime: Date.now() + 30000, // Start in 30 seconds
      endTime: null,
      winner: null,
      settings: {
        betAmount: 10,
        houseFee: 0.05,
        gameDuration: 180000, // 3 minutes
        maxCardsPerPlayer: 5
      }
    };

    // Generate all 400 cards for this game
    for (let cardNum = 1; cardNum <= 400; cardNum++) {
      game.cards.set(cardNum, {
        number: cardNum,
        numbers: this.generateCardNumbers(cardNum),
        owner: null,
        purchasedAt: null
      });
    }

    this.waitingGames.set(gameId, game);
    
    // Store in Redis
    await this.redisClient.set(`game:${gameId}`, JSON.stringify(game));
    
    // Emit event
    this.emit('gameCreated', game);
    
    console.log(`🆕 Game Created: ${gameId}`);
    
    // Start countdown
    this.startGameCountdown(gameId);
    
    return game;
  }

  generateCardNumbers(cardNumber) {
    // Use deterministic random based on card number + game ID
    const seed = cardNumber;
    const numbers = [];
    
    const ranges = {
      'B': { min: 1, max: 15 },
      'I': { min: 16, max: 30 },
      'N': { min: 31, max: 45 },
      'G': { min: 46, max: 60 },
      'O': { min: 61, max: 75 }
    };
    
    // Fisher-Yates shuffle with seed
    function seededShuffle(array, seed) {
      const result = [...array];
      const random = (seed) => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random(seed + i) * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }
    
    // Generate columns
    for (const [letter, range] of Object.entries(ranges)) {
      const columnNumbers = Array.from(
        { length: range.max - range.min + 1 },
        (_, i) => range.min + i
      );
      
      // Take 5 unique numbers for this column
      const shuffled = seededShuffle(columnNumbers, seed + letter.charCodeAt(0));
      const selected = shuffled.slice(0, 5);
      
      for (let i = 0; i < 5; i++) {
        if (!numbers[i]) numbers[i] = [];
        numbers[i].push({
          letter,
          number: selected[i],
          called: false,
          position: { row: i, col: letter }
        });
      }
    }
    
    // Mark center as free
    numbers[2][2].called = true;
    numbers[2][2].free = true;
    
    return numbers;
  }

  async startGameCountdown(gameId) {
    const game = this.waitingGames.get(gameId);
    if (!game) return;

    const countdownInterval = setInterval(async () => {
      const timeLeft = game.startTime - Date.now();
      
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        await this.startGame(gameId);
        return;
      }
      
      // Broadcast countdown to players
      this.io.to(`game:${gameId}`).emit('gameCountdown', {
        gameId,
        timeLeft: Math.ceil(timeLeft / 1000),
        status: 'waiting',
        players: Array.from(game.players).length,
        pot: game.pot
      });
      
    }, 1000);
  }

  async startGame(gameId) {
    let game = this.waitingGames.get(gameId);
    if (!game || game.players.size === 0) {
      console.log(`❌ Game ${gameId} cancelled - no players`);
      this.waitingGames.delete(gameId);
      this.activeGames.delete(gameId);
      return;
    }

    game.status = 'active';
    game.startTime = Date.now();
    this.waitingGames.delete(gameId);
    this.activeGames.set(gameId, game);
    
    // Update Redis
    await this.redisClient.set(`game:${gameId}`, JSON.stringify(game));
    
    // Broadcast game start
    this.io.to(`game:${gameId}`).emit('gameStarted', {
      gameId,
      pot: game.pot,
      playerCount: game.players.size
    });
    
    console.log(`🚀 Game Started: ${gameId} with ${game.players.size} players`);
    
    // Start calling numbers
    this.callNumbers(gameId);
  }

  async callNumbers(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game) return;
    
    const allNumbers = [];
    const ranges = { 'B': 15, 'I': 30, 'N': 45, 'G': 60, 'O': 75 };
    
    // Generate all 75 numbers
    for (const [letter, max] of Object.entries(ranges)) {
      const min = max - 14;
      for (let i = min; i <= max; i++) {
        allNumbers.push({ letter, number: i, called: false });
      }
    }
    
    // Shuffle numbers
    for (let i = allNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allNumbers[i], allNumbers[j]] = [allNumbers[j], allNumbers[i]];
    }
    
    let numberIndex = 0;
    const gameStartTime = Date.now();
    
    const callInterval = setInterval(async () => {
      // Check if game should end
      if (Date.now() - gameStartTime > game.settings.gameDuration || numberIndex >= allNumbers.length) {
        clearInterval(callInterval);
        await this.endGame(gameId);
        return;
      }
      
      // Call next number
      const number = allNumbers[numberIndex];
      number.called = true;
      numberIndex++;
      
      // Update game state
      game.calledNumbers.push(number);
      game.currentCalls = game.calledNumbers.slice(-3);
      
      // Mark number on all cards
      for (const [cardNum, card] of game.cards) {
        if (card.owner) {
          for (const row of card.numbers) {
            for (const cell of row) {
              if (cell.letter === number.letter && cell.number === number.number) {
                cell.called = true;
              }
            }
          }
        }
      }
      
      // Broadcast new number
      this.io.to(`game:${gameId}`).emit('numberCalled', {
        gameId,
        number: `${number.letter}${number.number}`,
        fullNumber: number,
        calledNumbers: game.calledNumbers,
        currentCalls: game.currentCalls
      });
      
      // Check for winners
      await this.checkWinners(gameId);
      
    }, 3000); // Call number every 3 seconds
  }

  async checkWinners(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game || game.winner) return;
    
    for (const [cardNum, card] of game.cards) {
      if (!card.owner) continue;
      
      if (this.checkCardForBingo(card.numbers)) {
        await this.declareWinner(gameId, card.owner, cardNum);
        return;
      }
    }
  }

  checkCardForBingo(cardNumbers) {
    // Check rows
    for (let row = 0; row < 5; row++) {
      if (cardNumbers[row].every(cell => cell.called || cell.free)) {
        return true;
      }
    }
    
    // Check columns
    for (let col = 0; col < 5; col++) {
      const column = cardNumbers.map(row => row[col]);
      if (column.every(cell => cell.called || cell.free)) {
        return true;
      }
    }
    
    // Check diagonals
    const diag1 = [cardNumbers[0][0], cardNumbers[1][1], cardNumbers[2][2], 
                   cardNumbers[3][3], cardNumbers[4][4]];
    const diag2 = [cardNumbers[0][4], cardNumbers[1][3], cardNumbers[2][2],
                   cardNumbers[3][1], cardNumbers[4][0]];
    
    if (diag1.every(cell => cell.called || cell.free) ||
        diag2.every(cell => cell.called || cell.free)) {
      return true;
    }
    
    return false;
  }

  async declareWinner(gameId, playerId, winningCardNum) {
    const game = this.activeGames.get(gameId);
    if (!game || game.winner) return;
    
    game.winner = playerId;
    game.winningCard = winningCardNum;
    game.status = 'completed';
    game.endTime = Date.now();
    
    // Calculate winnings (95% of pot)
    const winnings = game.pot * (1 - game.settings.houseFee);
    
    // Update Redis
    await this.redisClient.set(`game:${gameId}`, JSON.stringify(game));
    
    // Get player info
    const player = await this.getPlayerInfo(playerId);
    
    // Broadcast winner
    this.io.to(`game:${gameId}`).emit('winnerDeclared', {
      gameId,
      winner: {
        id: playerId,
        username: player?.username || 'Anonymous',
        avatar: player?.avatar
      },
      winningCard: winningCardNum,
      winnings: winnings,
      pot: game.pot
    });
    
    console.log(`🏆 Winner: ${playerId} won $${winnings} in game ${gameId}`);
    
    // Move to completed games
    this.activeGames.delete(gameId);
    
    // Schedule cleanup
    setTimeout(() => {
      this.redisClient.del(`game:${gameId}`);
    }, 3600000); // Delete after 1 hour
  }

  async endGame(gameId) {
    const game = this.activeGames.get(gameId);
    if (!game || game.winner) return;
    
    game.status = 'completed';
    game.endTime = Date.now();
    
    this.io.to(`game:${gameId}`).emit('gameEnded', {
      gameId,
      reason: 'timeout',
      pot: game.pot,
      rolledOver: true
    });
    
    // Roll over pot to next game
    console.log(`⏰ Game ${gameId} ended - no winner, pot rolled over`);
    
    this.activeGames.delete(gameId);
  }

  async joinGame(gameId, playerId) {
    const game = this.waitingGames.get(gameId);
    if (!game || game.status !== 'waiting') {
      throw new Error('Game not available for joining');
    }
    
    if (!game.players.has(playerId)) {
      game.players.add(playerId);
      await this.redisClient.set(`game:${gameId}`, JSON.stringify(game));
    }
    
    return game;
  }

  async purchaseCard(gameId, playerId, cardNumber) {
    const game = this.waitingGames.get(gameId) || this.activeGames.get(gameId);
    if (!game || game.status === 'completed') {
      throw new Error('Game not available');
    }
    
    if (game.status === 'active') {
      throw new Error('Game already started');
    }
    
    const card = game.cards.get(cardNumber);
    if (!card) {
      throw new Error('Invalid card number');
    }
    
    if (card.owner) {
      throw new Error('Card already purchased');
    }
    
    // Check player's card limit
    const playerCards = Array.from(game.cards.values())
      .filter(c => c.owner === playerId).length;
    
    if (playerCards >= game.settings.maxCardsPerPlayer) {
      throw new Error('Maximum cards per player reached');
    }
    
    // Update card ownership
    card.owner = playerId;
    card.purchasedAt = Date.now();
    
    // Update game pot
    game.pot += game.settings.betAmount;
    
    // Update Redis
    await this.redisClient.set(`game:${gameId}`, JSON.stringify(game));
    
    // Broadcast card purchase
    this.io.to(`game:${gameId}`).emit('cardPurchased', {
      gameId,
      playerId,
      cardNumber,
      pot: game.pot
    });
    
    return card;
  }

  async getPlayerInfo(playerId) {
    // In production, fetch from database
    return {
      id: playerId,
      username: `Player_${playerId.slice(0, 6)}`,
      avatar: `https://ui-avatars.com/api/?name=Player&background=random&size=128`
    };
  }

  async cleanupOldGames() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    for (const [gameId, game] of this.waitingGames) {
      if (game.startTime < oneHourAgo) {
        this.waitingGames.delete(gameId);
        await this.redisClient.del(`game:${gameId}`);
      }
    }
    
    for (const [gameId, game] of this.activeGames) {
      if (game.startTime < oneHourAgo) {
        this.activeGames.delete(gameId);
        await this.redisClient.del(`game:${gameId}`);
      }
    }
  }
}

module.exports = new GameEngine();
