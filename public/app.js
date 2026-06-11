(() => {
  const socket = io();
  const root = document.querySelector('#game-root');
  let roomTicker = null;

  const state = {
    screen: 'name',
    playerName: localStorage.getItem('senta:name') || '',
    roomCode: '',
    game: null,
    selectedHandIdx: null,
    drawMode: false,
    lastPileTap: [0, 0],
    lastSentaAt: 0,
    notice: ''
  };

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cardLabel(card) {
    if (!card) return '';
    const names = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    return `${names[card.value] || card.value}${card.suit}`;
  }

  function isRed(card) {
    return card && (card.suit === '♥' || card.suit === '♦');
  }

  function cardHtml(card, options = {}) {
    const classes = [
      'card',
      options.className || '',
      isRed(card) ? 'red' : 'black',
      options.selected ? 'selected' : '',
      options.empty ? 'empty' : ''
    ].filter(Boolean).join(' ');

    const attrs = [
      options.handIdx !== undefined ? `data-hand-idx="${options.handIdx}"` : '',
      options.pileIdx !== undefined ? `data-pile-idx="${options.pileIdx}"` : '',
      options.label ? `aria-label="${escapeHtml(options.label)}"` : ''
    ].filter(Boolean).join(' ');

    return `<button class="${classes}" ${attrs} type="button"><span>${escapeHtml(cardLabel(card))}</span></button>`;
  }

  function getPlayers() {
    if (!state.game) return { myIdx: 0, me: null, opp: null };
    let myIdx = state.game.players.findIndex(player => player.id === socket.id);
    if (myIdx === -1) {
      myIdx = state.game.players.findIndex(player => player.name === state.playerName);
    }
    if (myIdx === -1) myIdx = 0;
    return {
      myIdx,
      me: state.game.players[myIdx],
      opp: state.game.players[1 - myIdx]
    };
  }

  function canSenta() {
    if (!state.game || state.game.winner) return false;
    const [left, right] = state.game.centerPiles;
    const leftTop = left[left.length - 1];
    const rightTop = right[right.length - 1];
    return Boolean(leftTop && rightTop && leftTop.value === rightTop.value);
  }

  function setNotice(message) {
    state.notice = message || '';
    if (state.screen === 'game') renderGame();
  }

  function stopRoomTicker() {
    if (roomTicker) {
      clearInterval(roomTicker);
      roomTicker = null;
    }
  }

  function startRoomTicker() {
    if (roomTicker || !state.game || !state.game.countdownEndsAt) return;
    roomTicker = setInterval(() => {
      if (state.screen !== 'countdown' || !state.game || !state.game.countdownEndsAt) {
        stopRoomTicker();
        return;
      }
      renderCountdownScreen();
    }, 250);
  }

  function countdownSeconds() {
    if (!state.game || !state.game.countdownEndsAt) return null;
    return Math.max(0, Math.ceil((state.game.countdownEndsAt - Date.now()) / 1000));
  }

  function showNameForm() {
    stopRoomTicker();
    state.screen = 'name';
    root.innerHTML = `
      <section class="entry-shell">
        <h1>Senta</h1>
        <p class="lede">A fast two-player card race for one shared room code.</p>
        <form class="entry-card" data-form="name">
          <label for="name-input">Nickname</label>
          <input id="name-input" maxlength="14" autocomplete="nickname" placeholder="Your name" value="${escapeHtml(state.playerName)}">
          <button class="primary-btn" type="submit">Continue</button>
        </form>
      </section>
    `;
  }

  function showLobby() {
    stopRoomTicker();
    state.screen = 'lobby';
    root.innerHTML = `
      <section class="entry-shell">
        <div class="home-header">
          <div>
            <p class="eyebrow">Ready, ${escapeHtml(state.playerName)}</p>
            <h1>Senta</h1>
          </div>
          <button class="text-btn" data-action="rename" type="button">Rename</button>
        </div>
        <div class="lobby-grid">
          <button class="primary-btn tall" data-action="create-room" type="button">
            <span>Create Room</span>
            <small>Start a fresh table</small>
          </button>
          <form class="entry-card compact" data-form="join">
            <label for="room-input">Join with code</label>
            <input id="room-input" maxlength="5" autocapitalize="characters" placeholder="ABCDE">
            <button class="secondary-btn" type="submit">Join Room</button>
          </form>
        </div>
        <p class="hint">Share the room code with one friend. First to clear their deck and hand wins.</p>
        <p class="error-line" id="lobby-error" role="alert"></p>
      </section>
    `;
  }

  function showRoomCreated() {
    state.screen = 'room-created';
    renderRoomCreated();
  }

  function renderRoomCreated() {
    const players = state.game ? state.game.players : [];
    const votes = state.game && state.game.startVotes ? state.game.startVotes : {};
    const { myIdx } = getPlayers();
    const bothHere = Boolean(players[0] && players[0].id && players[1] && players[1].id);
    const hasStarted = Boolean(state.game && state.game.started);
    const voted = Boolean(votes[myIdx]);
    const canStart = bothHere && !voted && !hasStarted;
    const statusText = bothHere
        ? 'Both players are in. Press Start.'
        : 'Waiting for player 2';

    root.innerHTML = `
      <section class="waiting-room-screen">
        <p class="eyebrow">Game Room</p>
        <p class="lede">Share this code. Once both players are ready, the countdown starts.</p>
        <div class="waiting-code-card">
          <span>Room code</span>
          <strong>${escapeHtml(state.roomCode)}</strong>
          <button class="primary-btn" data-action="copy-room" type="button">Copy Code</button>
        </div>
        <div class="room-player-list">
          ${[0, 1].map(index => {
            const player = players[index];
            const joined = Boolean(player && player.id);
            const ready = Boolean(votes[index]);
            return `
              <div class="room-player ${joined ? 'joined' : 'empty'}">
                <span>Player ${index + 1}</span>
                <strong>${escapeHtml(joined ? player.name : 'Waiting for player')}</strong>
                <small>${ready ? 'Ready' : joined ? 'Not ready' : 'Open seat'}</small>
              </div>
            `;
          }).join('')}
        </div>
        <div class="waiting-status">
          <span aria-hidden="true"></span>
          ${escapeHtml(statusText)}
        </div>
        <button class="primary-btn" data-action="start-game" type="button" ${canStart ? '' : 'disabled'}>
          ${voted ? 'Ready' : 'Start'}
        </button>
        <button class="secondary-btn" data-action="home" type="button">Home</button>
      </section>
    `;
    stopRoomTicker();
  }

  function showCountdownScreen() {
    state.screen = 'countdown';
    renderCountdownScreen();
  }

  function renderCountdownScreen() {
    const countdown = countdownSeconds();
    const displayValue = countdown === null ? 5 : countdown;

    root.innerHTML = `
      <section class="countdown-screen">
        <p class="eyebrow">Both Players Ready</p>
        <div class="countdown-orb">${displayValue}</div>
        <h1>Starting</h1>
        <p class="lede">Get ready. Cards are dealt when the countdown hits zero.</p>
      </section>
    `;

    startRoomTicker();
  }

  function showGame() {
    stopRoomTicker();
    state.screen = 'game';
    renderGame();
  }

  function showWinnerScreen() {
    stopRoomTicker();
    state.screen = 'winner';
    renderWinnerScreen();
  }

  function renderPlayerPanel(player, title, side) {
    const name = player && player.name ? player.name : 'Waiting';
    const handCount = player && player.hand ? player.hand.length : 0;
    const deckCount = player ? player.deckCount : 0;
    const selected = player && typeof player.selectedHandIdx === 'number';

    return `
      <section class="player-panel ${side}">
        <div>
          <p>${title}</p>
          <strong>${escapeHtml(name)}</strong>
        </div>
        <div class="meters">
          <span><b>${deckCount}</b> deck</span>
          <span><b>${handCount}</b> hand</span>
        </div>
        ${selected ? '<div class="selection-pill">card picked</div>' : ''}
      </section>
    `;
  }

  function renderOpponentHand(opp) {
    if (!opp || !opp.hand) return '';
    return opp.hand.map((card, idx) => cardHtml(card, {
      className: 'mini-card opponent-card',
      selected: opp.selectedHandIdx === idx,
      label: 'Opponent card'
    })).join('');
  }

  function renderMyHand(me) {
    if (!me || !me.hand) return '';
    return me.hand.map((card, idx) => cardHtml(card, {
      className: 'hand-card',
      selected: state.selectedHandIdx === idx || state.drawMode,
      handIdx: idx,
      label: `Your ${cardLabel(card)}`
    })).join('');
  }

  function renderPile(pile, idx) {
    const top = pile[pile.length - 1];
    return `
      <div class="pile-wrap">
        <span>Pile ${idx + 1}</span>
        ${cardHtml(top, {
          className: 'center-card',
          pileIdx: idx,
          empty: !top,
          label: top ? `Center pile ${idx + 1}, ${cardLabel(top)}` : `Empty center pile ${idx + 1}`
        })}
        <small>${pile.length} cards</small>
      </div>
    `;
  }

  function renderActionDock(me, opp) {
    const ready = state.game.drawCardReady || [];
    const meReady = me && ready.includes(me.id);
    const oppReady = opp && ready.includes(opp.id);
    const drawDisabled = !state.game.started || state.game.winner || meReady || state.drawMode;
    let message = 'Pick a card, then tap a center pile.';

    if (!state.game.started) message = 'Waiting for your friend to join.';
    if (state.selectedHandIdx !== null) message = 'Tap a valid pile to play it.';
    if (state.drawMode) message = 'Choose one of your hand cards to place.';
    if (meReady && !oppReady) message = 'Waiting for the other player to draw.';
    if (!meReady && oppReady) message = 'Opponent wants to draw. Join when ready.';
    if (state.game.pendingWin) message = `${state.game.pendingWin.playerName} is almost out. SENTA can still stop it.`;
    if (state.notice) message = state.notice;

    return `
      <section class="action-dock">
        <p class="turn-message">${escapeHtml(message)}</p>
        <div class="dock-actions">
          <button class="secondary-btn icon-btn" data-action="cancel-select" type="button" ${state.selectedHandIdx === null && !state.drawMode ? 'disabled' : ''}>Cancel</button>
          <button class="primary-btn" data-action="draw-card" type="button" ${drawDisabled ? 'disabled' : ''}>${meReady ? 'Waiting' : 'Draw Card'}</button>
          <button class="senta-btn" data-action="senta" type="button" ${canSenta() ? '' : 'disabled'}>SENTA</button>
        </div>
      </section>
    `;
  }

  function renderWinnerScreen() {
    if (!state.game.winner) return '';
    const { myIdx } = getPlayers();
    const votes = state.game.rematchVotes || {};
    const voted = Boolean(votes[myIdx]);
    const winnerName = state.game.winner;
    const isDisconnectWin = winnerName.toLowerCase().includes('player left');
    const didWin = !isDisconnectWin && winnerName === state.playerName;
    const title = isDisconnectWin ? 'Round Ended' : didWin ? 'You Won' : `${winnerName} Won`;
    const subtitle = isDisconnectWin
      ? 'The other player left the room.'
      : didWin
        ? 'Clean table. That was yours.'
        : 'Another round is one tap away.';

    root.innerHTML = `
      <section class="winner-screen">
        <div class="winner-mark" aria-hidden="true">${isDisconnectWin ? '!' : 'W'}</div>
        <p class="eyebrow">Round Complete</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(subtitle)}</p>
        <div class="winner-stats">
          ${state.game.players.map(player => `
            <div>
              <span>${escapeHtml(player.name || 'Player')}</span>
              <strong>${player.deckCount + player.hand.length}</strong>
              <small>cards left</small>
            </div>
          `).join('')}
        </div>
        <div class="winner-actions">
          <button class="primary-btn" data-action="play-again" type="button" ${voted || isDisconnectWin ? 'disabled' : ''}>
            ${voted ? 'Waiting for player' : 'Play Again'}
          </button>
          <button class="secondary-btn" data-action="home" type="button">Home</button>
        </div>
        <p class="hint">${voted ? 'The next round starts when both players tap Play Again.' : 'Play Again keeps the same players and room.'}</p>
      </section>
    `;
  }

  function renderGame() {
    if (!state.game) {
      root.innerHTML = `
        <section class="table-shell">
          <header class="top-bar">
            <button class="ghost-btn" data-action="leave-room" type="button">Leave</button>
            <strong>Room ${escapeHtml(state.roomCode)}</strong>
          </header>
          <div class="waiting-card">Waiting for room state...</div>
        </section>
      `;
      return;
    }

    const { me, opp } = getPlayers();
    const opponentHand = renderOpponentHand(opp);
    const myHand = renderMyHand(me);

    root.innerHTML = `
      <section class="table-shell">
        <header class="top-bar">
          <button class="ghost-btn" data-action="leave-room" type="button">Leave</button>
          <div>
            <span>Room</span>
            <strong>${escapeHtml(state.roomCode || state.game.roomCode)}</strong>
          </div>
          <button class="ghost-btn" data-action="copy-room" type="button">Copy</button>
        </header>

        ${renderPlayerPanel(opp, 'Opponent', 'opponent')}

        <section class="opponent-hand" aria-label="Opponent hand">
          ${opponentHand || '<div class="empty-row">Waiting for opponent</div>'}
        </section>

        <section class="center-table">
          <div class="table-glow" aria-hidden="true"></div>
          ${(state.game.centerPiles || [[], []]).map(renderPile).join('')}
        </section>

        ${renderPlayerPanel(me, 'You', 'you')}

        <section class="my-hand" aria-label="Your hand">
          ${myHand || '<div class="empty-row">No cards left</div>'}
        </section>

        ${renderActionDock(me, opp)}
      </section>
    `;
  }

  function createRoom() {
    socket.emit('createRoom', state.playerName, response => {
      if (!response || !response.success) {
        setLobbyError(response && response.error ? response.error : 'Could not create a room.');
        return;
      }

      state.roomCode = response.roomCode;
      state.game = response.state;
      state.selectedHandIdx = null;
      showRoomCreated();
    });
  }

  function joinRoom(roomCode) {
    socket.emit('joinRoom', { roomCode, playerName: state.playerName }, response => {
      if (!response || !response.success) {
        setLobbyError(response && response.error ? response.error : 'Could not join that room.');
        return;
      }

      state.roomCode = roomCode.toUpperCase();
      state.game = response.state;
      state.selectedHandIdx = null;
      showRoomCreated();
    });
  }

  function setLobbyError(message) {
    const error = document.querySelector('#lobby-error');
    if (error) error.textContent = message;
  }

  function clearSelection() {
    state.selectedHandIdx = null;
    state.drawMode = false;
    setNotice('');
  }

  function goHome() {
    state.screen = 'lobby';
    state.roomCode = '';
    state.game = null;
    state.selectedHandIdx = null;
    state.drawMode = false;
    state.notice = '';
    showLobby();
  }

  function requestSenta() {
    if (!canSenta() || Date.now() - state.lastSentaAt < 800) return;
    state.lastSentaAt = Date.now();
    socket.emit('senta', { roomCode: state.roomCode }, response => {
      if (response && !response.success && response.error) setNotice(response.error);
    });
  }

  function handleCardSelection(handIdx) {
    const { me } = getPlayers();
    if (!me) return;

    if (state.drawMode) {
      socket.emit('drawCardRequest', { roomCode: state.roomCode, handCardIdx: handIdx }, response => {
        if (response && !response.success) setNotice(response.error || 'Choose another card.');
      });
      clearSelection();
      return;
    }

    state.selectedHandIdx = handIdx;
    socket.emit('selectHandCard', { roomCode: state.roomCode, handIdx });
    renderGame();
  }

  function handlePileTap(pileIdx) {
    const now = Date.now();
    const wasDoubleTap = now - state.lastPileTap[pileIdx] < 360;
    state.lastPileTap[pileIdx] = now;

    if (wasDoubleTap && canSenta()) {
      requestSenta();
      return;
    }

    if (Math.abs(state.lastPileTap[0] - state.lastPileTap[1]) < 360 && canSenta()) {
      requestSenta();
      return;
    }

    if (state.selectedHandIdx === null) {
      setNotice(canSenta() ? 'Tap SENTA, double tap a pile, or pick a card.' : 'Pick a card first.');
      return;
    }

    socket.emit('playCard', {
      roomCode: state.roomCode,
      handIndex: state.selectedHandIdx,
      pileIndex: pileIdx
    }, response => {
      if (response && !response.success) setNotice(response.error || 'That move is not valid.');
    });

    state.selectedHandIdx = null;
    renderGame();
  }

  root.addEventListener('submit', event => {
    event.preventDefault();

    const form = event.target.closest('form');
    if (!form) return;

    if (form.dataset.form === 'name') {
      const input = form.querySelector('#name-input');
      state.playerName = input.value.trim().slice(0, 14);
      if (!state.playerName) return;
      localStorage.setItem('senta:name', state.playerName);
      showLobby();
      return;
    }

    if (form.dataset.form === 'join') {
      const input = form.querySelector('#room-input');
      const code = input.value.trim().toUpperCase();
      if (code) joinRoom(code);
    }
  });

  root.addEventListener('click', event => {
    const actionTarget = event.target.closest('[data-action]');
    const handCard = event.target.closest('[data-hand-idx]');
    const pileCard = event.target.closest('[data-pile-idx]');

    if (handCard) {
      handleCardSelection(Number(handCard.dataset.handIdx));
      return;
    }

    if (pileCard) {
      handlePileTap(Number(pileCard.dataset.pileIdx));
      return;
    }

    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    if (action === 'create-room') createRoom();
    if (action === 'leave-room') window.location.reload();
    if (action === 'copy-room' && state.roomCode) navigator.clipboard && navigator.clipboard.writeText(state.roomCode);
    if (action === 'cancel-select') clearSelection();
    if (action === 'senta') requestSenta();
    if (action === 'start-game') {
      socket.emit('startGame', { roomCode: state.roomCode }, response => {
        if (response && !response.success && response.error) {
          state.notice = response.error;
          if (state.screen === 'room-created') renderRoomCreated();
        }
      });
    }
    if (action === 'play-again') socket.emit('rematch', { roomCode: state.roomCode });
    if (action === 'home') goHome();
    if (action === 'rename') showNameForm();

    if (action === 'draw-card') {
      const { me } = getPlayers();
      if (!me) return;

      if (me.deckCount > 0) {
        socket.emit('drawCardRequest', { roomCode: state.roomCode }, response => {
          if (response && !response.success) setNotice(response.error || 'Could not draw yet.');
        });
      } else if (me.hand.length > 0) {
        state.drawMode = true;
        state.selectedHandIdx = null;
        setNotice('Choose one of your hand cards to place.');
      }
    }
  });

  socket.on('update', nextGame => {
    state.game = nextGame;
    state.roomCode = state.roomCode || nextGame.roomCode;
    state.notice = '';

    if (nextGame.winner) {
      showWinnerScreen();
    } else if (nextGame.countdownEndsAt && !nextGame.started) {
      showCountdownScreen();
    } else if ((state.screen === 'room-created' || state.screen === 'lobby' || state.screen === 'countdown') && !nextGame.started) {
      renderRoomCreated();
    } else if ((state.screen === 'room-created' || state.screen === 'countdown') && nextGame.started) {
      showGame();
    } else if (state.screen === 'game' || state.screen === 'winner') {
      showGame();
    }
  });

  socket.on('showSenta', ({ playerName }) => {
    const overlay = document.createElement('div');
    overlay.className = 'senta-overlay';
    overlay.innerHTML = `<div><span>SENTA</span><strong>${escapeHtml(playerName)} hit it</strong></div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 1400);
  });

  socket.on('drawCardReset', () => {
    state.drawMode = false;
    state.selectedHandIdx = null;
    if (state.screen === 'game') renderGame();
  });

  socket.on('rematchRequested', () => {
    if (state.screen === 'winner') renderWinnerScreen();
    if (state.screen === 'game') renderGame();
  });

  socket.on('rematchStarted', () => {
    stopRoomTicker();
    state.selectedHandIdx = null;
    state.drawMode = false;
    state.notice = '';
    state.screen = 'game';
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
  }

  if (state.playerName) {
    showLobby();
  } else {
    showNameForm();
  }
})();
