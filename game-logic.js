function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = [1,2,3,4,5,6,7,8,9,10,11,12,13];
  let deck = [];
  for (let i = 0; i < 2; i++) {
    for (let v of values) {
      for (let s of suits) {
        deck.push({ value: v, suit: s });
      }
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function createGame(playerName, playerId) {
  const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  const deck = createDeck();
  const player1 = {
    id: playerId,
    name: playerName,
    deck: deck.slice(0, 52),
    hand: [],
    connected: true
  };
  const player2 = {
    id: null,
    name: null,
    deck: deck.slice(52),
    hand: [],
    connected: false
  };
  const game = {
    roomCode,
    players: [player1, player2],
    centerPiles: [[], []],
    started: false,
    winner: null,
    sentaBuffer: false,
    lastUpdate: Date.now(),
    forceDrawVotes: {},
    getPublicState: function() {
      return {
        players: this.players.map((p, i) => ({
          name: p.name,
          hand: p.hand,
          deckCount: p.deck.length,
          connected: p.connected,
        })),
        centerPiles: this.centerPiles,
        started: this.started,
        winner: this.winner
      }
    }
  };
  return { roomCode, game };
}

function joinGame(game, playerName, playerId) {
  if (game.players[1].id) return { success: false, error: 'Room full.' };
  game.players[1].id = playerId;
  game.players[1].name = playerName;
  game.players[1].connected = true;
  for (let i = 0; i < 5; i++) {
    game.players[0].hand.push(game.players[0].deck.pop());
    game.players[1].hand.push(game.players[1].deck.pop());
  }
  game.centerPiles = [
    [game.players[0].deck.pop()],
    [game.players[1].deck.pop()]
  ];
  game.started = true;
  return { success: true };
}

function isOneApart(a, b) {
  if (a === 1 && b === 13) return true;
  if (a === 13 && b === 1) return true;
  return Math.abs(a - b) === 1;
}

function playerHasMove(player, centerPiles) {
  if (!player.hand || player.hand.length === 0) return false;
  for (let handCard of player.hand) {
    for (let pile of centerPiles) {
      let top = pile[pile.length - 1];
      if (top && isOneApart(handCard.value, top.value)) {
        return true;
      }
    }
  }
  return false;
}

function playCard(game, playerId, handIdx, pileIdx) {
  if (!game.started || game.winner) return { success: false };
  const playerIndex = game.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { success: false };
  const player = game.players[playerIndex];
  const card = player.hand[handIdx];
  const centerPileTop = game.centerPiles[pileIdx][game.centerPiles[pileIdx].length - 1];
  if (isOneApart(card.value, centerPileTop.value)) {
    game.centerPiles[pileIdx].push(card);
    // If we have a new card to draw, *replace* the card at the played index
    if (player.deck.length > 0) {
      player.hand[handIdx] = player.deck.pop();
    } else {
      // If no card in deck, just remove the played card
      player.hand.splice(handIdx, 1);
    }
    if (player.hand.length === 0 && player.deck.length === 0) {
      game.winner = player.name;
    }
    return { success: true, update: true };
  } else {
    return { success: false, update: false };
  }
}

function sentaAction(game, playerId) {
  if (!game.started || game.winner) return { success: false };
  const top0 = game.centerPiles[0][game.centerPiles[0].length - 1];
  const top1 = game.centerPiles[1][game.centerPiles[1].length - 1];
  if (!top0 || !top1 || top0.value !== top1.value) return { success: false, update: false };
  if (game.sentaBuffer && Date.now() - game.lastUpdate < 500) return { success: false, update: false };
  game.sentaBuffer = true;
  setTimeout(() => game.sentaBuffer = false, 500);

  const playerIndex = game.players.findIndex(p => p.id === playerId);
  const opponent = game.players[1 - playerIndex];
  const allCenter = [...game.centerPiles[0], ...game.centerPiles[1]];
  opponent.deck = allCenter.concat(opponent.deck);
  opponent.deck = opponent.deck.sort(() => Math.random() - 0.5);

  // After SENTA, center piles are empty!
  game.centerPiles[0] = [];
  game.centerPiles[1] = [];

  game.lastUpdate = Date.now();

  return { success: true, update: true };
}

function rematch(game) {
  const deck = createDeck();
  game.players[0].deck = deck.slice(0, 52);
  game.players[1].deck = deck.slice(52);
  game.players[0].hand = [];
  game.players[1].hand = [];
  for (let i = 0; i < 5; i++) {
    game.players[0].hand.push(game.players[0].deck.pop());
    game.players[1].hand.push(game.players[1].deck.pop());
  }
  game.centerPiles = [
    [game.players[0].deck.pop()],
    [game.players[1].deck.pop()]
  ];
  game.winner = null;
  game.started = true;
}

// Voting for Draw Card button (by player index, 0 or 1)
function playerForceDraw(game, playerId) {
  if (!game.forceDrawVotes) {
    game.forceDrawVotes = {};
  }
  if (!game.started || game.winner) return { success: false };

  let playerIdx = game.players.findIndex(p => p.id === playerId);
  if (playerIdx === -1) return { success: false };

  game.forceDrawVotes[playerIdx] = true;
  const bothVoted = game.forceDrawVotes[0] && game.forceDrawVotes[1];

  if (bothVoted) {
    for (let i = 0; i < 2; i++) {
      let player = game.players[i];
      let card = null;
      if (player.deck.length > 0) {
        card = player.deck.pop();
      } else if (player.hand.length > 0) {
        const randIdx = Math.floor(Math.random() * player.hand.length);
        card = player.hand.splice(randIdx, 1)[0];
      }
      if (card) {
        game.centerPiles[i].push(card);
      }
    }
    game.forceDrawVotes = {};
    return { success: true, update: true, drew: true };
  }
  return { success: true, update: false, drew: false };
}

function playerDrawCard(game, playerId, handCardIdx) {
  if (!game.drawCardReady) game.drawCardReady = [];
  if (!game.handCardChoice) game.handCardChoice = {};
  if (game.drawCardReady.includes(playerId)) return { success: false };

  if (typeof handCardIdx === 'number') {
    game.handCardChoice[playerId] = handCardIdx;
  }

  game.drawCardReady.push(playerId);

  // Wait for both
  if (game.drawCardReady.length < 2) return { success: true, update: false };

  // Both ready: perform draw!
  const p0 = game.players[0];
  const p1 = game.players[1];
  let placedCards = [null, null];

  [p0, p1].forEach((player, i) => {
    let card;
    if (player.deck.length > 0) {
      card = player.deck.pop();
    } else if (
      typeof game.handCardChoice[player.id] === 'number' &&
      player.hand.length > 0
    ) {
      card = player.hand.splice(game.handCardChoice[player.id], 1)[0];
    }
    if (card) {
      game.centerPiles[i].push(card);
      placedCards[i] = card;
    }
  });

  // Reset for next draw
  game.drawCardReady = [];
  game.handCardChoice = {};

  // --- WIN CONDITION CHECK HERE ---
  // If either player has no hand cards and no deck after placing a card, check for senta
  for (let i = 0; i < 2; i++) {
    const player = game.players[i];
    if (player.hand.length === 0 && player.deck.length === 0) {
      // Senta check
      const piles = game.centerPiles;
      if (
        piles[0].length && piles[1].length &&
        piles[0][piles[0].length-1].value === piles[1][piles[1].length-1].value
      ) {
        // Wait for senta to be called (give 2 seconds), otherwise this player wins
        setTimeout(() => {
          // If game.winner is still not set and still same top values, declare winner
          if (!game.winner) {
            const curPiles = game.centerPiles;
            if (
              curPiles[0].length && curPiles[1].length &&
              curPiles[0][curPiles[0].length-1].value === curPiles[1][curPiles[1].length-1].value
            ) {
              game.winner = player.name;
            }
          }
        }, 2000);
      } else {
        // Not a senta situation, declare winner immediately
        game.winner = player.name;
      }
    }
  }

  return { success: true, update: true };
}

module.exports = { createGame, joinGame, playCard, sentaAction, rematch, playerForceDraw, playerDrawCard };
