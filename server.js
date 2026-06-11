const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const {
  createGame,
  joinGame,
  playCard,
  sentaAction,
  rematch,
  playerForceDraw,
  playerDrawCard,
  selectHandCard,
  finalizePendingWin,
  voteToStart,
  startRound
} = require('./game-logic');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const games = {};
const pendingWinTimers = {};
const startTimers = {};

function sendUpdate(roomCode) {
  const game = games[roomCode];
  if (!game) return;

  io.to(roomCode).emit('update', game.getPublicState());
  schedulePendingWin(roomCode);
}

function clearPendingWinTimer(roomCode) {
  if (pendingWinTimers[roomCode]) {
    clearTimeout(pendingWinTimers[roomCode]);
    delete pendingWinTimers[roomCode];
  }
}

function clearStartTimer(roomCode) {
  if (startTimers[roomCode]) {
    clearTimeout(startTimers[roomCode]);
    delete startTimers[roomCode];
  }
}

function schedulePendingWin(roomCode) {
  const game = games[roomCode];
  clearPendingWinTimer(roomCode);

  if (!game || !game.pendingWin || game.winner) return;

  const delay = Math.max(0, game.pendingWin.deadline - Date.now());
  pendingWinTimers[roomCode] = setTimeout(() => {
    const result = finalizePendingWin(game);
    if (result.update) sendUpdate(roomCode);
  }, delay + 25);
}

function getGame(roomCode, callback) {
  const game = games[roomCode];
  if (!game && callback) callback({ success: false, error: 'Room not found.' });
  return game;
}

function scheduleStart(roomCode) {
  const game = games[roomCode];
  clearStartTimer(roomCode);

  if (!game || !game.countdownEndsAt || game.started) return;

  const delay = Math.max(0, game.countdownEndsAt - Date.now());
  startTimers[roomCode] = setTimeout(() => {
    const result = startRound(game);
    if (result.update) {
      io.to(roomCode).emit('gameStarted');
      sendUpdate(roomCode);
    }
  }, delay + 25);
}

io.on('connection', socket => {
  socket.on('createRoom', (playerName, callback) => {
    const name = String(playerName || '').trim().slice(0, 14) || 'Player';
    const { roomCode, game } = createGame(name, socket.id);

    games[roomCode] = game;
    socket.join(roomCode);
    callback({ success: true, roomCode, state: game.getPublicState() });
  });

  socket.on('joinRoom', ({ roomCode, playerName }, callback) => {
    const normalizedRoom = String(roomCode || '').trim().toUpperCase();
    const game = getGame(normalizedRoom, callback);
    if (!game) return;

    const name = String(playerName || '').trim().slice(0, 14) || 'Player';
    const result = joinGame(game, name, socket.id);
    if (!result.success) return callback(result);

    socket.join(normalizedRoom);
    callback({ success: true, state: game.getPublicState() });
    sendUpdate(normalizedRoom);
  });

  socket.on('playCard', ({ roomCode, handIndex, pileIndex }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const result = playCard(game, socket.id, Number(handIndex), Number(pileIndex));
    if (result.update) sendUpdate(roomCode);
    if (callback) callback(result);
  });

  socket.on('startGame', ({ roomCode }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const result = voteToStart(game, socket.id);
    if (result.update) {
      sendUpdate(roomCode);
      if (result.countdown) scheduleStart(roomCode);
    }
    if (callback) callback(result);
  });

  socket.on('senta', ({ roomCode }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const player = game.players.find(currentPlayer => currentPlayer.id === socket.id);
    if (!player) {
      if (callback) callback({ success: false, error: 'Player not found.' });
      return;
    }

    io.to(roomCode).emit('showSenta', { playerName: player.name });

    setTimeout(() => {
      const result = sentaAction(game, socket.id);
      if (result.update) sendUpdate(roomCode);
      if (callback) callback(result);
    }, 900);
  });

  socket.on('rematch', ({ roomCode }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const playerIdx = game.players.findIndex(player => player.id === socket.id);
    if (playerIdx === -1) {
      if (callback) callback({ success: false, error: 'Player not found.' });
      return;
    }

    game.rematchVotes[playerIdx] = true;

    if (game.rematchVotes[0] && game.rematchVotes[1]) {
      clearPendingWinTimer(roomCode);
      clearStartTimer(roomCode);
      rematch(game);
      io.to(roomCode).emit('rematchStarted');
      sendUpdate(roomCode);
    } else {
      io.to(roomCode).emit('rematchRequested', {
        playerIdx,
        playerName: game.players[playerIdx].name,
        votes: { ...game.rematchVotes }
      });
      sendUpdate(roomCode);
    }

    if (callback) callback({ success: true });
  });

  socket.on('forceDraw', ({ roomCode }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const result = playerForceDraw(game, socket.id);
    if (result.update) sendUpdate(roomCode);
    if (callback) callback(result);
  });

  socket.on('drawCardRequest', ({ roomCode, handCardIdx }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const result = playerDrawCard(
      game,
      socket.id,
      typeof handCardIdx === 'number' ? handCardIdx : undefined
    );

    if (result.update || result.success) sendUpdate(roomCode);
    if (game.drawCardReady.length === 0) io.to(roomCode).emit('drawCardReset');
    if (callback) callback(result);
  });

  socket.on('selectHandCard', ({ roomCode, handIdx }, callback) => {
    const game = getGame(roomCode, callback);
    if (!game) return;

    const result = selectHandCard(game, socket.id, Number(handIdx));
    if (result.update) sendUpdate(roomCode);
    if (callback) callback(result);
  });

  socket.on('disconnect', () => {
    for (const roomCode of Object.keys(games)) {
      const game = games[roomCode];
      const playerIdx = game.players.findIndex(player => player.id === socket.id);

      if (playerIdx !== -1) {
        game.players[playerIdx].connected = false;
        game.winner = 'Game over: player left';
        game.pendingWin = null;
        game.countdownEndsAt = null;
        game.startVotes = {};
        game.drawCardReady = [];
        game.handCardChoice = {};
        clearPendingWinTimer(roomCode);
        clearStartTimer(roomCode);
        sendUpdate(roomCode);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server running on :${PORT}`));
