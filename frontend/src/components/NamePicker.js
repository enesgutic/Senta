import React, { useState } from 'react';

export default function NamePicker({ onSubmit }) {
  const [name, setName] = useState('');

  return (
    <div className="centered">
      <h2>Pick a nickname</h2>
      <input
        className="big-input"
        type="text"
        placeholder="Enter your name"
        value={name}
        maxLength={12}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && name) onSubmit(name); }}
      />
      <button
        className="main-btn"
        disabled={!name}
        onClick={() => onSubmit(name)}
      >Continue</button>
    </div>
  );
}
