import React from 'react';

export default function Card({ card, onClick, highlight, disabled }) {
  if (!card) return <div className="card empty"></div>;
  const valueToDisplay = v => {
    if (v === 1) return "A";
    if (v === 11) return "J";
    if (v === 12) return "Q";
    if (v === 13) return "K";
    return v;
  };
  return (
    <div
      className={`card${highlight ? " highlight" : ""}${disabled ? " disabled" : ""}`}
      onClick={disabled ? undefined : onClick}
      tabIndex={0}
      style={{ touchAction: "manipulation" }}
    >
      <span className="card-value">{valueToDisplay(card.value)}</span>
      <span className="card-suit">{card.suit}</span>
    </div>
  );
}
