import React, { useState } from 'react';
import { socket } from '../socket';

export default function RoomLobby({ playerName, onHost, onJoin, setGameState }) {
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  const createRoom = () => {
    socket.connect();
    socket.emit('createRoom', playerName, ({ roomCode }) => {
      onHost(roomCode);
    });

    socket.on('update', (gameState) => setGameState(gameState));
  };

  const joinRoom = () => {
    socket.connect();
    socket.emit('joinRoom', { roomCode: roomCode.toUpperCase(), playerName }, (resp) => {
      if (resp.error) setError(resp.error);
      else onJoin(roomCode.toUpperCase());
    });

    socket.on('update', (gameState) => setGameState(gameState));
  };

  return (
    <div className="centered">
      <h2>Card Race</h2>
      <button className="main-btn" onClick={createRoom}>Create Room</button>
      <div style={{ margin: '20px 0' }}>OR</div>
      <input
        className="big-input"
        type="text"
        placeholder="Enter Room Code"
        value={roomCode}
        maxLength={5}
        onChange={e => setRoomCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
        style={{ textAlign: 'center', fontSize: 22, letterSpacing: '2px' }}
      />
      <button className="main-btn" disabled={roomCode.length < 5} onClick={joinRoom}>Join Room</button>
      {error && <div className="error">{error}</div>}
      <p style={{ marginTop: 40, color: "#888" }}>Share your code with a friend to play 1v1!</p>
    </div>
  );
}
