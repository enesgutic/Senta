$(function() {
  const socket = io();

  let playerName = '';
  let roomCode = '';
  let isHost = false;
  let gameState = null;
  let selectedHandIdx = null;
  let otherPlayerSelectedHandIdx = null;
  let pileTouchTimes = [0, 0]; // For SENTA detection (simultaneous tap)
  let lastTapTimes = [0, 0];   // For SENTA detection (double tap)
  let lastTouchTimestamp = 0;
  let countdownValue = null;
  

  function showCountdown(num) {
    if (num <= 0) {
      $('#countdown-overlay').remove();
      countdownValue = null;
      return;
    }
    countdownValue = num;
    if (!$('#countdown-overlay').length) {
      $('body').append('<div id="countdown-overlay"></div>');
    }
    $('#countdown-overlay').html(
      `<div style="
        position:fixed;
        top:0;left:0;right:0;bottom:0;
        z-index:3000;
        background:rgba(20,20,32,0.90);
        display:flex;
        align-items:center;socket.on('countdow
        justify-content:center;
        ">
          <span style="
            font-size: 96px;
            color: #fbbf24;
            font-weight: bold;
            text-shadow: 0 2px 24px #111, 0 2px 54px #111;
            font-family: Impact, Arial Black, sans-serif;
          ">${num}</span>
      </div>`
    );
  }

  function showNameForm() {
    $('#game-root').html(`
      <h2>Enter your nickname</h2>
      <input id="name-input" maxlength="12" placeholder="Name">
      <button id="name-continue">Continue</button>
    `);
    $('#name-continue').click(function() {
      playerName = $('#name-input').val().trim();
      if (playerName) showLobby();
    });
  }

  function showLobby() {
    $('#game-root').html(`
      <h2>Card Race</h2>
      <button id="create-room">Create Room</button>
      <div style="margin:22px 0; color:#aaa; font-size:1.1rem; letter-spacing:2px; text-align:center;">OR</div>
      <input id="room-input" maxlength="5" placeholder="Room Code" style="text-transform:uppercase;">
      <button id="join-room">Join Room</button>
      <div id="lobby-error" style="color:#f44; margin-top:10px"></div>
      <p style="margin-top: 40px; color: #888; text-align:center;">Share your code with a friend to play 1v1!</p>
    `);
    $('#create-room').click(function() {
      socket.emit('createRoom', playerName, function(data) {
        roomCode = data.roomCode;
        isHost = true;
        showGame();
      });
    });
    $('#join-room').click(function() {
      roomCode = $('#room-input').val().trim().toUpperCase();
      if (!roomCode) return;
      socket.emit('joinRoom', { roomCode, playerName }, function(resp) {
        if (resp.error) {
          $('#lobby-error').text(resp.error);
        } else {
          isHost = false;
          showGame();
        }
      });
    });
  }

  function showGame() {
    $('#game-root').html(`
  <div id="room-label">
    <span>
        Room: <b style="font-size:1.06em;letter-spacing:2.5px">${roomCode}</b>
    </span>
    </div>
  <div style="padding-top:72px">
    <div id="opponent-info"></div>
    <div id="center-field"></div>
    <div id="my-hand"></div>
    <div id="game-controls"></div>
    <div id="game-over"></div>
    <div id="you-info"></div>
    <div id="draw-card-area" style="text-align:center; margin:12px 0;"></div>
    <button id="leave-btn" class="fixed-leave-btn">Leave Room</button>
  </div>
`);

    $('#leave-btn').off().on('touchstart click', function(e) {
    e.preventDefault();
    if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
    if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
    location.reload();
    });
    updateGameUI(gameState);
  }
  if (state.countdownActive || !state.started) {
    $('#game-controls').html('<div style="color:#ffd900;text-align:center;">Game starting soon...</div>');
    $('#draw-card-btn').prop('disabled', true);
    return;
  }

  function updateGameUI(state) {
    gameState = state;
    if (!state) return;
    const idx = state.players[0].name === playerName ? 0 : 1;
    const me = state.players[idx];
    const opp = state.players[1 - idx];

    // Opponent info at top
    $('#opponent-info').html(`
    <div style="color:#fff;background:#2b2f3a;padding:9px 18px 9px 20px;border-radius:30px 13px 13px 30px;min-width:120px;box-shadow:0 2px 14px #0012;display:inline-block;margin-bottom:16px;">
        <b style="color:#43c0f7;">Opponent:</b> ${opp.name || "Waiting..."}<br>
        <span style="font-size:1.1em;">🃏 <b>${opp.deckCount}</b> <span style="color:#aaa;">Deck</span> &nbsp; | &nbsp; 🤚 <b>${opp.hand.length}</b> <span style="color:#aaa;">Hand</span></span>
    </div>
    `);

    // "You" info above Draw Card button
    $('#you-info').html(`
    <div style="color:#fff;background:#19324d;padding:9px 20px 9px 18px;border-radius:13px 30px 30px 13px;min-width:120px;box-shadow:0 2px 14px #0012;display:inline-block;margin:0 0 12px 0;">
        <b style="color:#ffd900;">You:</b> ${me.name}<br>
        <span style="font-size:1.1em;">🃏 <b>${me.deckCount}</b> <span style="color:#aaa;">Deck</span> &nbsp; | &nbsp; 🤚 <b>${me.hand.length}</b> <span style="color:#aaa;">Hand</span></span>
    </div>
    `);

    // Opponent's hand (face up, gray, centered)
    let oppHand = '';
    if (opp.hand) {
      oppHand = opp.hand.map((card, i) =>
    `<div class="card opp-card${otherPlayerSelectedHandIdx === i ? ' opp-selected' : ''}">${displayCard(card)}</div>`
    ).join('');
    }
    $('#center-field').html(`
    <div style="margin-bottom:6px;text-align:center;">Opponent's hand:</div>
    <div style="display:flex;justify-content:center;gap:6px;">${oppHand}</div>
    <div class="center-field main-field-spacing">
        ${state.centerPiles.map((pile, i) => {
        const top = pile.length ? pile[pile.length - 1] : null;
        return `<div class="card center-pile" data-pileidx="${i}" style="margin: 10px;">${top ? displayCard(top) : ''}</div>`;
        }).join('')}
    </div>
    `);

    // ===== DRAW CARD BUTTON =====
    $('#draw-card-area').html(`<button id="draw-card-btn" style="font-size:22px;padding:8px 26px;background:#1d72b8;color:#fff;border-radius:10px;">Draw Card</button>`);
    $('#draw-card-btn').off().on('touchstart click', function(e) {
        e.preventDefault();
        if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
        if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
        selectedHandIdx = null;
        updateGameUI(gameState); // optional, to clear selection highlight
    if (me.deckCount > 0) {
        socket.emit('drawCardRequest', { roomCode });
        $('#draw-card-btn').prop('disabled', true).text('Waiting for other player...');
    } else if (me.hand && me.hand.length > 0) {
        // Prompt player to pick a card from hand
        $('#game-controls').html('<div class="draw-prompt-choose">Pick a hand card to draw:</div>');
        $('.my-hand-card').css('box-shadow', '0 0 10px 2px #1d72b8');
        $('.my-hand-card').off().on('touchstart click', function(e) {
        e.preventDefault();
        if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
        if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
        const handIdx = Number($(this).attr('data-handidx'));
        socket.emit('drawCardRequest', { roomCode, handCardIdx: handIdx });
        $('.my-hand-card').css('box-shadow', '');
        $('#draw-card-btn').prop('disabled', true).text('Waiting for other player...');
        });
    }
    });
    socket.on('countdown', function({ value }) {
      showCountdown(value);
    });

    // Your hand (selectable, centered, highlighted if selected)
    let myHand = `
    <div class="my-hand-cards-container">
        ${me.hand ? me.hand.map((card, i) => 
        `<div class="card my-hand-card${selectedHandIdx === i ? ' selected' : ''}" data-handidx="${i}" style="cursor:pointer;">${displayCard(card)}</div>`
        ).join('') : ''}
    </div>
    `;
    $('#my-hand').html(myHand);

    // Game over
    if (state.winner) {
      $('#game-over').html(`
        <div style="margin:20px;font-size:30px;"><b>${state.winner}</b> wins!</div>
        <button id="rematch-btn">Rematch</button>
      `);
      $('#rematch-btn').off().click(function() {
        selectedHandIdx = null;
        socket.emit('rematch', { roomCode });
      });
    } else {
      $('#game-over').empty();
    }

    // Controls for playing card
    $('#game-controls').html(selectedHandIdx === null ? 
      '<div style="text-align:center;">Select a card from your hand to play.</div>' :
      '<div style="text-align:center;">Now click a pile above to play your card, or <button id="cancel-move">Cancel</button></div>'
    );

    // Select card from hand
    $('.my-hand-card').off().on('touchstart click', function(e) {
    e.preventDefault();
    if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
    if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
    selectedHandIdx = Number($(this).attr('data-handidx'));
    socket.emit('selectHandCard', { roomCode, handIdx: selectedHandIdx });
    updateGameUI(gameState); // Re-render to highlight card
    });

    // Cancel move
    $('#cancel-move').off().on('touchstart click', function(e) {
        e.preventDefault();
        if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
        if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
        selectedHandIdx = null;
        updateGameUI(gameState);
    });

    // SENTA/double tap/simultaneous tap detection and play handler for piles
    $('.center-pile').each(function(i) {
    $(this).off().on('touchstart click', function(e) {
        e.preventDefault();
        if (e.type === 'click' && Date.now() - lastTouchTimestamp < 500) return;
        if (e.type === 'touchstart') lastTouchTimestamp = Date.now();
        const now = Date.now();
        pileTouchTimes[i] = now;

        // Double tap on pile
        if (now - lastTapTimes[i] < 350) {
        if (canSenta()) {
            activateSenta();
            lastTapTimes[i] = 0;
            return;
        }
        }
        lastTapTimes[i] = now;

        // Simultaneous tap on both piles
        if (Math.abs(pileTouchTimes[0] - pileTouchTimes[1]) < 350 && canSenta()) {
        activateSenta();
        pileTouchTimes[0] = pileTouchTimes[1] = 0;
        return;
        }

        // Play card if one is selected
        if (selectedHandIdx !== null) {
        const pileIdx = Number($(this).attr('data-pileidx'));
        socket.emit('playCard', { roomCode, handIndex: selectedHandIdx, pileIndex: pileIdx }, function(resp) {
            selectedHandIdx = null;
            updateGameUI(gameState);
        });
        }
    });
    });
  }

  function canSenta() {
    if (!gameState) return false;
    const piles = gameState.centerPiles;
    if (
      piles[0].length &&
      piles[1].length &&
      piles[0][piles[0].length-1].value === piles[1][piles[1].length-1].value
    ) {
      return true;
    }
    return false;
  }

  function activateSenta() {
    socket.emit('senta', { roomCode });
  }

  function showSentaAnimation(playerName) {
    if ($('#senta-animation').length) return;
    const $div = $(`
      <div id="senta-animation" style="
        position:fixed;
        left:0;top:0;right:0;bottom:0;
        z-index:1000;
        display:flex;
        align-items:center;
        justify-content:center;
        pointer-events:none;
      ">
        <span style="
          font-size:72px;
          font-weight:bold;
          color:#ffc400;
          text-shadow:0 2px 18px #222,0 2px 48px #c32;
          animation:senta-bounce 4s;
          font-family:Impact,Arial Black,sans-serif;
        ">SENTA by ${playerName || 'Player'}!</span>
      </div>
    `);
    $('body').append($div);
    setTimeout(() => $div.remove(), 4000); // 4 seconds, slightly longer than server's 3 seconds
  }

  function displayCard(card) {
    if (!card) return '';
    const v = card.value;
    const suit = card.suit;
    if (v === 1) return 'A' + suit;
    if (v === 11) return 'J' + suit;
    if (v === 12) return 'Q' + suit;
    if (v === 13) return 'K' + suit;
    return v + suit;
  }

  // Listen for server updates
  socket.on('update', function(state) {
    updateGameUI(state);
  });

  socket.on('showSenta', function({ playerName }) {
    showSentaAnimation(playerName);
  });

  socket.on('handCardSelected', function({ playerIdx, handIdx }) {
    const idx = gameState.players[0].name === playerName ? 0 : 1;
    if (playerIdx === idx) {
        selectedHandIdx = handIdx;
    } else {
        otherPlayerSelectedHandIdx = handIdx;
    }
    updateGameUI(gameState);
    });

  showNameForm();
});


socket.on('drawCardReset', function() {
  $('#draw-card-btn').prop('disabled', false).text('Draw Card');
});