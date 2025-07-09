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
  socket.on('createRoom', (playerName, callback) => {
    const { roomCode, game } = createGame(playerName, socket.id);
    games[roomCode] = game;
    socket.join(roomCode);
    callback({ roomCode });
    io.to(roomCode).emit('update', game.getPublicState());
  });

  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const game = games[roomCode];
    if (!game) return callback({ error: 'Room not found.' });
    const joinRes = joinGame(game, playerName, socket.id);
    if (!joinRes.success) return callback({ error: joinRes.error });
    socket.join(roomCode);
    callback({ success: true });
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
    const result = sentaAction(game, socket.id);
    if (result && result.update) io.to(roomCode).emit('update', game.getPublicState());
    if (callback) callback(result);
  });

  socket.on('rematch', ({ roomCode }, callback) => {
    const game = games[roomCode];
    if (!game) return;
    rematch(game);
    io.to(roomCode).emit('update', game.getPublicState());
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
    if (result && result.update) io.to(roomCode).emit('update', game.getPublicState());
    // After both have requested, reset button (let both click again next round)
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
    // Find the game/room this socket was in
    for (const roomCode in games) {
      const game = games[roomCode];
      const playerIdx = game.players.findIndex(p => p.id === socket.id);
      if (playerIdx !== -1) {
        game.winner = "Game Over (player left)";
        io.to(roomCode).emit('update', game.getPublicState());
        // Optionally: remove game from memory after a delay
        // delete games[roomCode];
      }
    }
  });
}); // <-- This closes the io.on('connection', ...) function

server.listen(3001, () => console.log('Server running on :3001'));