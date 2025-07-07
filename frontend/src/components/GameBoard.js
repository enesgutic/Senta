import React, { useEffect, useState, useMemo, useRef } from 'react';
import { socket } from '../socket';
import Card from './Card';

function getPlayerIndex(gameState, playerName) {
  if (!gameState || !gameState.players) return 0;
  return gameState.players[0].name === playerName ? 0 : 1;
}

export default function GameBoard({ playerName, roomCode, setStep, gameState, setGameState }) {
  const [selectedHandIdx, setSelectedHandIdx] = useState(null);
  const [invalidMove, setInvalidMove] = useState(false);
  const [showSentaBounce, setShowSentaBounce] = useState(false);
  const [drawClicked, setDrawClicked] = useState(false);
  const [waitingForDraw, setWaitingForDraw] = useState(false);
  const sentaReady = useRef(false);
  const lastTapRef = useRef({ idx: null, time: 0 });
  const pileTouchRefs = [useRef(false), useRef(false)];
  const sentaTimeoutRef = useRef(null);

  useEffect(() => {
    socket.on('update', newState => {
      setGameState(newState);
      setSelectedHandIdx(null);
      setInvalidMove(false);
      setShowSentaBounce(false);
      setDrawClicked(false);
      setWaitingForDraw(false);
      pileTouchRefs[0].current = false;
      pileTouchRefs[1].current = false;
      lastTapRef.current = { idx: null, time: 0 };
      if (sentaTimeoutRef.current) {
        clearTimeout(sentaTimeoutRef.current);
        sentaTimeoutRef.current = null;
      }
    });
    return () => {
      socket.off('update');
      if (sentaTimeoutRef.current) {
        clearTimeout(sentaTimeoutRef.current);
        sentaTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setGameState]);

  const idx = getPlayerIndex(gameState, playerName);
  const me = gameState?.players?.[idx] || {};
  const opp = gameState?.players?.[1 - idx] || {};
  const field = useMemo(() => gameState?.centerPiles || [[], []], [gameState]);

  if (!gameState) return <div className="centered">Waiting for opponent...</div>;

  const sentaActive =
    field[0] &&
    field[1] &&
    field[0].length &&
    field[1].length &&
    field[0][field[0].length - 1]?.value === field[1][field[1].length - 1]?.value;

  sentaReady.current = sentaActive;

  function handleCenterPileClick(pileIdx) {
    if (selectedHandIdx == null) return;
    socket.emit('playCard', { roomCode, handIndex: selectedHandIdx, pileIndex: pileIdx }, resp => {
      if (!resp.success) {
        setInvalidMove(true);
        setTimeout(() => setInvalidMove(false), 300);
      }
      setSelectedHandIdx(null);
    });
  }

  function handleHandCardClick(i) {
    if (selectedHandIdx === i) {
      setSelectedHandIdx(null);
    } else {
      setSelectedHandIdx(i);
      setInvalidMove(false);
    }
  }

  function handlePileTouchStart(pileIdx, e) {
    if (!sentaReady.current) return;
    pileTouchRefs[pileIdx].current = true;
    if (pileTouchRefs[0].current && pileTouchRefs[1].current) {
      triggerSenta();
    }
  }

  function handlePileTouchEnd(pileIdx, e) {
    pileTouchRefs[pileIdx].current = false;
  }

  function handlePileDoubleClick(pileIdx, e) {
    if (!sentaReady.current) return;
    triggerSenta();
  }

  function handlePileTap(pileIdx, e) {
    if (!sentaReady.current) return;
    const now = Date.now();
    if (
      lastTapRef.current.idx === pileIdx &&
      now - lastTapRef.current.time < 350
    ) {
      triggerSenta();
      lastTapRef.current = { idx: null, time: 0 };
    } else {
      lastTapRef.current = { idx: pileIdx, time: now };
    }
  }

  function triggerSenta() {
    if (sentaTimeoutRef.current) return;
    socket.emit('senta', { roomCode });
    setShowSentaBounce(true);
    sentaTimeoutRef.current = setTimeout(() => {
      setShowSentaBounce(false);
      sentaTimeoutRef.current = null;
    }, 1300);
    pileTouchRefs[0].current = false;
    pileTouchRefs[1].current = false;
    lastTapRef.current = { idx: null, time: 0 };
  }

  function handleDrawClick() {
    setDrawClicked(true);
    setWaitingForDraw(true);
    socket.emit('forceDraw', { roomCode }, (resp) => {
      if (resp && resp.drew) {
        setWaitingForDraw(false);
        setDrawClicked(false);
      }
    });
  }

  function handleRematch() {
    socket.emit('rematch', { roomCode });
  }

  return (
    <div className="game-container">
      <div className="header">
        <span>Room: <b>{roomCode}</b></span>
        <span style={{ float: 'right' }}>
          {me.name} <b>vs</b> {opp.name || 'Waiting...'}
        </span>
      </div>
      <div className="hand opp-hand">
        {opp.hand && opp.hand.map((c, i) => <Card key={i} card={c} disabled />)}
        <div className="deck-count">Deck: {opp.deckCount}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        <div className="center-field">
          {field.map((pile, i) =>
            <div
              key={i}
              className="pile"
              onTouchStart={e => handlePileTouchStart(i, e)}
              onTouchEnd={e => handlePileTouchEnd(i, e)}
              onClick={e => handlePileTap(i, e)}
              onDoubleClick={e => handlePileDoubleClick(i, e)}
              style={{ cursor: sentaActive ? 'pointer' : undefined }}
            >
              <Card
                card={pile[pile.length - 1]}
                onClick={
                  (!sentaActive && selectedHandIdx != null)
                    ? () => handleCenterPileClick(i)
                    : undefined
                }
                highlight={sentaActive}
                disabled={sentaActive}
              />
            </div>
          )}
        </div>
        <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <button
            className="main-btn"
            style={{ minHeight: 44, minWidth: 44, marginBottom: 4, fontWeight: 'bold', fontSize: 18 }}
            disabled={drawClicked || waitingForDraw}
            onClick={handleDrawClick}
          >
            {drawClicked || waitingForDraw ? "Waiting..." : "Draw Card"}
          </button>
          <span style={{ fontSize: 12, color: '#888', maxWidth: 70, textAlign: 'center' }}>
            Both players must press
          </span>
        </div>
      </div>
      {showSentaBounce && (
        <div
          className="senta-bounce"
          style={{
            position: 'fixed',
            left: '50%',
            top: '40%',
            transform: 'translate(-50%, -50%) scale(1)',
            zIndex: 99,
            fontSize: 64,
            color: '#ff2146',
            fontWeight: 'bold',
            textShadow: '0 4px 32px #000b, 0 1px 1px #fff8',
            animation: 'senta-bounce 1.2s cubic-bezier(.7,0,.3,1)'
          }}
        >
          SENTA!
        </div>
      )}
      <div className="hand my-hand">
        {me.hand && me.hand.map((c, i) =>
          <Card
            key={i}
            card={c}
            onClick={() => handleHandCardClick(i)}
            highlight={selectedHandIdx === i}
          />
        )}
        <div className="deck-count">Deck: {me.deckCount}</div>
      </div>
      {gameState.winner && (
        <div className="game-over">
          <div>
            <b>{gameState.winner}</b> wins!
          </div>
          <button className="main-btn" onClick={handleRematch}>Rematch</button>
          <button className="main-btn" onClick={() => { setStep('lobby'); socket.disconnect(); }}>Leave Room</button>
        </div>
      )}
      {invalidMove && (
        <div className="invalid-move" style={{ color: 'red', textAlign: 'center', marginTop: 10 }}>
          Invalid move!
        </div>
      )}
      <style>
        {`
          @keyframes senta-bounce {
            0%   { transform: translate(-50%, -50%) scale(0.7) rotate(-5deg); opacity: 0.1;}
            10%  { transform: translate(-50%, -50%) scale(1.2) rotate(8deg);}
            25%  { transform: translate(-50%, -50%) scale(0.98) rotate(-6deg);}
            38%  { transform: translate(-50%, -50%) scale(1.12) rotate(6deg);}
            55%  { transform: translate(-50%, -50%) scale(1.04) rotate(-3deg);}
            70%  { transform: translate(-50%, -50%) scale(1.08) rotate(2deg);}
            80%  { transform: translate(-50%, -50%) scale(1.01) rotate(-1deg);}
            90%  { transform: translate(-50%, -50%) scale(1) rotate(0deg);}
            100% { transform: translate(-50%, -50%) scale(0.6) rotate(-2deg); opacity: 0;}
          }
        `}
      </style>
    </div>
  );
}
