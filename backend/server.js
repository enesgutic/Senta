const express = require('express');
const http = require('http');
const path = require('path'); // <-- Required for serving static files
const { Server } = require('socket.io');
const { createGame, joinGame, playCard, sentaAction, rematch, playerForceDraw } = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

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

  socket.on('disconnect', () => {
    // Optionally: handle disconnect logic, clean up rooms, etc
  });
});

// ---- ADD THESE LINES to serve React frontend ----
// Serves the static files from React's build folder
app.use(express.static(path.join(__dirname, '../frontend/build')));

// For any request that doesn't match an API route, send back React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});
// --------------------------------------------------

server.listen(3001, () => console.log('Server running on :3001'));
