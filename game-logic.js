const CARD_SUITS = ['♠', '♥', '♦', '♣'];
const CARD_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const STARTING_HAND_SIZE = 5;
const PENDING_WIN_MS = 2200;
const START_COUNTDOWN_MS = 5000;

function shuffle(cards) {
  return cards
    .map(card => ({ card, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ card }) => card);
}

function createDeck() {
  const deck = [];

  for (let copy = 0; copy < 2; copy += 1) {
    for (const value of CARD_VALUES) {
      for (const suit of CARD_SUITS) {
        deck.push({ value, suit });
      }
    }
  }

  return shuffle(deck);
}

function createPlayer(id, name, deck, connected) {
  return {
    id,
    name,
    deck,
    hand: [],
    connected,
    selectedHandIdx: null
  };
}

function dealOpeningCards(game) {
  for (let i = 0; i < STARTING_HAND_SIZE; i += 1) {
    game.players[0].hand.push(game.players[0].deck.pop());
    game.players[1].hand.push(game.players[1].deck.pop());
  }

  game.centerPiles = [
    [game.players[0].deck.pop()],
    [game.players[1].deck.pop()]
  ];
}

function resetRound(game) {
  const deck = createDeck();

  game.players[0].deck = deck.slice(0, 52);
  game.players[1].deck = deck.slice(52);
  game.players[0].hand = [];
  game.players[1].hand = [];
  game.players[0].selectedHandIdx = null;
  game.players[1].selectedHandIdx = null;
  game.centerPiles = [[], []];
  game.started = true;
  game.winner = null;
  game.pendingWin = null;
  game.drawCardReady = [];
  game.handCardChoice = {};
  game.forceDrawVotes = {};
  game.rematchVotes = {};
  game.startVotes = {};
  game.countdownEndsAt = null;
  game.sentaClaim = null;
  game.sentaBufferUntil = 0;
  game.lastUpdate = Date.now();

  dealOpeningCards(game);
}

function createGame(playerName, playerId) {
  const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  const deck = createDeck();

  const game = {
    roomCode,
    players: [
      createPlayer(playerId, playerName, deck.slice(0, 52), true),
      createPlayer(null, null, deck.slice(52), false)
    ],
    centerPiles: [[], []],
    started: false,
    winner: null,
    pendingWin: null,
    drawCardReady: [],
    handCardChoice: {},
    forceDrawVotes: {},
    rematchVotes: {},
    startVotes: {},
    countdownEndsAt: null,
    sentaClaim: null,
    sentaBufferUntil: 0,
    lastUpdate: Date.now(),
    getPublicState() {
      return {
        roomCode: this.roomCode,
        players: this.players.map(player => ({
          id: player.id,
          name: player.name,
          hand: player.hand,
          deckCount: player.deck.length,
          connected: player.connected,
          selectedHandIdx: player.selectedHandIdx
        })),
        centerPiles: this.centerPiles,
        started: this.started,
        winner: this.winner,
        pendingWin: this.pendingWin,
        drawCardReady: [...this.drawCardReady],
        rematchVotes: { ...this.rematchVotes },
        startVotes: { ...this.startVotes },
        countdownEndsAt: this.countdownEndsAt,
        sentaClaim: this.sentaClaim ? { playerName: this.sentaClaim.playerName } : null,
        serverTime: Date.now()
      };
    }
  };

  return { roomCode, game };
}

function joinGame(game, playerName, playerId) {
  if (game.players[1].id) {
    return { success: false, error: 'Room full.' };
  }

  game.players[1].id = playerId;
  game.players[1].name = playerName;
  game.players[1].connected = true;
  game.startVotes = {};
  game.countdownEndsAt = null;

  return { success: true, update: true };
}

function voteToStart(game, playerId) {
  if (game.started || game.winner) return { success: false, error: 'Game already started.' };
  if (!game.players[0].id || !game.players[1].id) {
    return { success: false, error: 'Waiting for player 2.' };
  }

  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not found.' };

  game.startVotes[playerIndex] = true;

  if (game.startVotes[0] && game.startVotes[1] && !game.countdownEndsAt) {
    game.countdownEndsAt = Date.now() + START_COUNTDOWN_MS;
    return { success: true, update: true, countdown: true };
  }

  return { success: true, update: true, countdown: false };
}

function startRound(game) {
  if (game.started || game.winner) return { success: false, update: false };
  if (!game.players[0].id || !game.players[1].id) {
    return { success: false, update: false, error: 'Need two players.' };
  }

  game.players[0].hand = [];
  game.players[1].hand = [];
  game.players[0].selectedHandIdx = null;
  game.players[1].selectedHandIdx = null;
  game.centerPiles = [[], []];
  game.started = true;
  game.pendingWin = null;
  game.drawCardReady = [];
  game.handCardChoice = {};
  game.forceDrawVotes = {};
  game.startVotes = {};
  game.countdownEndsAt = null;
  game.sentaClaim = null;
  game.lastUpdate = Date.now();
  dealOpeningCards(game);

  return { success: true, update: true };
}

function isOneApart(a, b) {
  return (a === 1 && b === 13) || (a === 13 && b === 1) || Math.abs(a - b) === 1;
}

function topCardsMatch(game) {
  const top0 = getTopCard(game.centerPiles[0]);
  const top1 = getTopCard(game.centerPiles[1]);
  return Boolean(top0 && top1 && top0.value === top1.value);
}

function getTopCard(pile) {
  return pile.length ? pile[pile.length - 1] : null;
}

function getPlayerIndex(game, playerId) {
  return game.players.findIndex(player => player.id === playerId);
}

function hasFinished(player) {
  return player.hand.length === 0 && player.deck.length === 0;
}

function armWinOrFinish(game, playerIndex) {
  const player = game.players[playerIndex];
  if (!hasFinished(player) || game.winner) return;

  game.winner = player.name;
  game.pendingWin = null;
}

function finalizePendingWin(game) {
  if (!game.pendingWin || game.winner || Date.now() < game.pendingWin.deadline) {
    return { success: false, update: false };
  }

  const pending = game.pendingWin;
  const player = game.players[pending.playerIndex];

  if (player && player.id === pending.playerId && hasFinished(player) && topCardsMatch(game)) {
    game.winner = player.name;
  }

  game.pendingWin = null;
  return { success: true, update: true };
}

function playCard(game, playerId, handIdx, pileIdx) {
  if (!game.started || game.winner) return { success: false, error: 'Game is not active.' };
  if (game.sentaClaim) return { success: false, error: 'SENTA is resolving.' };

  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not found.' };

  const player = game.players[playerIndex];
  const card = player.hand[handIdx];
  const pile = game.centerPiles[pileIdx];
  const centerPileTop = pile && getTopCard(pile);

  if (!card || !centerPileTop) return { success: false, error: 'Choose a valid card and pile.' };
  if (!isOneApart(card.value, centerPileTop.value)) {
    return { success: false, error: 'That card must be one higher or lower.' };
  }

  pile.push(card);

  if (player.deck.length > 0) {
    player.hand[handIdx] = player.deck.pop();
  } else {
    player.hand.splice(handIdx, 1);
  }

  player.selectedHandIdx = null;
  game.pendingWin = null;
  armWinOrFinish(game, playerIndex);
  game.lastUpdate = Date.now();

  return { success: true, update: true };
}

function sentaAction(game, playerId) {
  if (!game.started || game.winner) return { success: false, error: 'Game is not active.' };
  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not found.' };
  if (!game.sentaClaim || game.sentaClaim.playerId !== playerId) {
    return { success: false, error: 'Another player already hit SENTA.' };
  }

  const opponent = game.players[1 - playerIndex];
  const allCenter = [...game.centerPiles[0], ...game.centerPiles[1]];

  opponent.deck = shuffle(allCenter.concat(opponent.deck));
  while (opponent.hand.length < STARTING_HAND_SIZE && opponent.deck.length > 0) {
    opponent.hand.push(opponent.deck.pop());
  }

  game.centerPiles = [[], []];
  game.pendingWin = null;
  game.drawCardReady = [];
  game.handCardChoice = {};
  game.sentaClaim = null;
  game.sentaBufferUntil = Date.now() + 650;
  game.lastUpdate = Date.now();

  return { success: true, update: true };
}

function claimSenta(game, playerId) {
  if (!game.started || game.winner) return { success: false, error: 'Game is not active.' };
  if (!topCardsMatch(game)) return { success: false, error: 'SENTA needs matching center cards.' };
  if (game.sentaClaim) return { success: false, error: 'Another player already hit SENTA.' };
  if (Date.now() < game.sentaBufferUntil) return { success: false, error: 'SENTA is cooling down.' };

  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not found.' };

  const player = game.players[playerIndex];
  game.sentaClaim = {
    playerId,
    playerName: player.name,
    claimedAt: Date.now()
  };
  game.lastUpdate = Date.now();

  return { success: true, update: true, playerName: player.name };
}

function rematch(game) {
  resetRound(game);
}

function drawOneToPile(game, player, playerIndex, handCardIdx) {
  let card = null;

  if (player.deck.length > 0) {
    card = player.deck.pop();
  } else if (typeof handCardIdx === 'number' && player.hand[handCardIdx]) {
    card = player.hand.splice(handCardIdx, 1)[0];
  }

  if (card) {
    game.centerPiles[playerIndex].push(card);
  }

  return card;
}

function playerDrawCard(game, playerId, handCardIdx) {
  if (!game.started || game.winner) return { success: false, error: 'Game is not active.' };
  if (game.sentaClaim) return { success: false, error: 'SENTA is resolving.' };
  if (game.drawCardReady.includes(playerId)) {
    return { success: false, error: 'Already waiting for the other player.' };
  }

  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false, error: 'Player not found.' };

  const player = game.players[playerIndex];
  if (player.deck.length === 0 && player.hand.length > 0 && typeof handCardIdx !== 'number') {
    return { success: false, error: 'Choose a hand card to draw.' };
  }

  if (typeof handCardIdx === 'number') {
    game.handCardChoice[playerId] = handCardIdx;
  }

  game.drawCardReady.push(playerId);
  player.selectedHandIdx = null;

  if (game.drawCardReady.length < 2) {
    return { success: true, update: true, waiting: true };
  }

  game.pendingWin = null;
  game.players.forEach((currentPlayer, idx) => {
    drawOneToPile(game, currentPlayer, idx, game.handCardChoice[currentPlayer.id]);
  });

  game.drawCardReady = [];
  game.handCardChoice = {};
  game.players.forEach((currentPlayer, idx) => armWinOrFinish(game, idx));
  game.lastUpdate = Date.now();

  return { success: true, update: true, drew: true };
}

function playerForceDraw(game, playerId) {
  return playerDrawCard(game, playerId);
}

function selectHandCard(game, playerId, handIdx) {
  const playerIndex = getPlayerIndex(game, playerId);
  if (playerIndex === -1) return { success: false };

  const player = game.players[playerIndex];
  player.selectedHandIdx = player.hand[handIdx] ? handIdx : null;

  return { success: true, update: true };
}

module.exports = {
  createGame,
  joinGame,
  playCard,
  sentaAction,
  rematch,
  playerForceDraw,
  playerDrawCard,
  selectHandCard,
  claimSenta,
  finalizePendingWin,
  voteToStart,
  startRound
};
