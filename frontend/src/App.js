import React, { useState } from 'react';
import NamePicker from './components/NamePicker';
import RoomLobby from './components/RoomLobby';
import GameBoard from './components/GameBoard';
import './styles.css';

export default function App() {
  const [step, setStep] = useState('name');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);

  // Game state from socket will be passed down
  const [gameState, setGameState] = useState(null);

  if (step === 'name') {
    return (
      <NamePicker
        onSubmit={name => {
          setPlayerName(name);
          setStep('lobby');
        }}
      />
    );
  }

  if (step === 'lobby') {
    return (
      <RoomLobby
        playerName={playerName}
        onHost={room => {
          setIsHost(true);
          setRoomCode(room);
          setStep('game');
        }}
        onJoin={room => {
          setIsHost(false);
          setRoomCode(room);
          setStep('game');
        }}
        setGameState={setGameState}
      />
    );
  }

  if (step === 'game') {
    return (
      <GameBoard
        playerName={playerName}
        roomCode={roomCode}
        isHost={isHost}
        setStep={setStep}
        gameState={gameState}
        setGameState={setGameState}
      />
    );
  }

  return null;
}
