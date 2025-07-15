const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { createGame, joinGame, playCard, sentaAction, rematch, playerDrawCard } = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = {}; // roomCode: gameState

  io.on('connection', (socket) => {
  // CREATE ROOM
  socket.on('createRoom', (playerName, callback) => {
    const { roomCode, game } = createGame(playerName, socket.id);
    games[roomCode] = game;
    socket.join(roomCode);
    callback({ roomCode });
    // Don't start game immediately, just wait for 2nd player
  });

  // JOIN ROOM
  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const game = games[roomCode];
    if (!game) return callback({ error: 'Room not found.' });
    const joinRes = joinGame(game, playerName, socket.id);
    if (!joinRes.success) return callback({ error: joinRes.error });
    socket.join(roomCode);
    callback({ success: true });
    // Start the countdown only if not started yet
    game.started = true;
    io.to(roomCode).emit('update', game.getPublicState());
  });

  socket.on('playCard', ({ roomCode, handIndex, pileIndex }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    const result = playCard(game, socket.id, handIndex, pileIndex);
    if (result && result.update) io.to(roomCode).emit('update', game.getPublicState());
    if (callback) callback(result);
  });

  socket.on('senta', ({ roomCode }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    // 1. Show SENTA to all clients right away (with who initiated it)
    const player = game.players.find(p => p.id === socket.id);
    io.to(roomCode).emit('showSenta', { playerName: player ? player.name : 'Player' });
    // 2. Wait 3 seconds before applying SENTA logic
    setTimeout(() => {
      const result = sentaAction(game, socket.id);
      if (result && result.update) io.to(roomCode).emit('update', game.getPublicState());
      if (callback) callback(result);
    }, 3000);
  });

  socket.on('rematch', ({ roomCode }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    if (!game.rematchVotes) game.rematchVotes = {};
    const playerIdx = game.players.findIndex(p => p.id === socket.id);
    if (playerIdx === -1) return;

    game.rematchVotes[playerIdx] = true;

    // Notify both players of the rematch request and who requested
    io.to(roomCode).emit('rematchRequested', {
      playerIdx,
      playerName: game.players[playerIdx].name,
      votes: game.rematchVotes
    });

    // If both have agreed
    if (game.rematchVotes[0] && game.rematchVotes[1]) {
      rematch(game);
      io.to(roomCode).emit('update', game.getPublicState());
      io.to(roomCode).emit('rematchStarted');
      game.rematchVotes = {}; // Reset for next round
    }

    if (callback) callback({ success: true });
  });

  socket.on('forceDraw', ({ roomCode }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    const result = playerForceDraw(game, socket.id);
    if (result && result.update) io.to(roomCode).emit('update', game.getPublicState());
    if (callback) callback(result);
  });

  socket.on('drawCardRequest', ({ roomCode, handCardIdx }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    const result = playerDrawCard(game, socket.id, handCardIdx);
    // Always emit update so opponent can see that someone pressed
    io.to(roomCode).emit('update', game.getPublicState());
    if (game.drawCardReady && game.drawCardReady.length === 0) {
      io.to(roomCode).emit('drawCardReset');
    }
    if (callback) callback(result);
  });

  socket.on('selectHandCard', ({ roomCode, handIdx }) => {
    const game = games[roomCode];
    if (!game) return;
    // Find the player index
    let playerIdx = game.players.findIndex(p => p.id === socket.id);
    if (playerIdx === -1) return;
    game.players[playerIdx].selectedHandIdx = handIdx;
    io.to(roomCode).emit('handCardSelected', { playerIdx, handIdx });
  });

  socket.on('disconnect', () => {
    for (const roomCode in games) {
      const game = games[roomCode];
      const playerIdx = game.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        game.winner = "Game Over (player left)";
        // Reset temporary states
        game.forceDrawVotes = {};
        game.drawCardReady = [];
        game.handCardChoice = {};
        game.sentaPending = false;
        game.sentaBuffer = false;
        io.to(roomCode).emit('update', game.getPublicState());
      }
    }
  });
});



server.listen(3001, () => console.log('Server running on :3001'));