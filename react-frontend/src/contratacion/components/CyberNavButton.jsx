import React from 'react';
import styled from 'styled-components';

/**
 * CyberNavButton - Adaptación del diseño del usuario para navegación de módulos.
 */
const CyberNavButton = ({ label, icon: Icon, isActive, onClick, badge, isLight }) => {
  return (
    <StyledWrapper className={`${isActive ? 'active' : ''} ${isLight ? 'is-light' : ''}`}>
      <div className="btn-inner">
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq">
            <feColorMatrix values="1 0 0 0 0 
            0 1 0 0 0 
            0 0 1 0 0 
            0 0 0 9 0" />
          </filter>
          <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq2">
            <feColorMatrix values="1 0 0 0 0 
            0 1 0 0 0 
            0 0 1 0 0 
            0 0 0 3 0" />
          </filter>
          <filter width="300%" x="-100%" height="300%" y="-100%" id="unopaq3">
            <feColorMatrix values="1 0 0 0.2 0 
            0 1 0 0.2 0 
            0 0 1 0.2 0 
            0 0 0 2 0" />
          </filter>
        </svg>
        <button className="real-button" onClick={onClick} />
        <div className="button-container">
          <div className="spin spin-blur" />
          <div className="spin spin-intense" />
          <div className="backdrop" />
          <div className="button-border">
            <div className="spin spin-inside" />
            <div className="button-content">
              {Icon && <Icon size={14} className={isActive ? 'text-blue-400' : ''} />}
              <span className="label-text">{label}</span>
              {badge !== undefined && badge !== null && (
                <span className="badge">{badge}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  transform: scale(0.85); /* Más grande para la cabecera */
  width: 140px; 
  height: 52px;
  margin: -8px -2px; /* Margen ajustado para el nuevo scale */

  .btn-inner {
     position: relative;
  }

  .button-container {
    position: relative;
  }

  .button-border {
    padding: 1px; /* Borde más fino y futurista */
    inset: 0;
    background: rgba(101, 188, 247, 0.1);
    /* Forma hexagonal / corte cibernético */
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }

  .button-content {
    justify-content: center;
    align-items: center;
    border: none;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
    width: 120px;
    height: 44px;
    background: #060a0f;
    display: flex;
    flex-direction: row;
    gap: 6px;
    color: #8fa3b5;
    overflow: hidden;
    font-family: inherit;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    transition: all 0.3s ease;
    padding: 0 10px;
  }

  &.is-light .button-content {
    background: #f1f5f9;
    color: #475569;
    background-image: linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.02) 50%);
    background-size: 4px 4px;
  }

  .label-text {
    flex: 1;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge {
    background: rgba(101, 188, 247, 0.1);
    padding: 2px 5px;
    font-size: 9px;
    color: #65BCF7;
    border-left: 1px solid rgba(101, 188, 247, 0.3);
  }

  &.active .badge {
    background: rgba(101, 188, 247, 0.2);
    color: #fff;
    box-shadow: 0 0 5px rgba(101, 188, 247, 0.5);
  }

  &.active .button-content {
    background: #0a1520;
    color: #65BCF7;
    box-shadow: inset 0 0 10px rgba(47, 123, 184, 0.4);
  }

  &.is-light.active .button-content {
    background: #e0f2fe;
    color: #0284c7;
  }

  .real-button {
    position: absolute;
    width: 120px;
    height: 48px;
    z-index: 5;
    outline: none;
    border: none;
    cursor: pointer;
    opacity: 0;
    left: 0;
    top: 0;
    clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 50%,
      transparent 0,
      rgba(0,0,0,0.4) 100%
    );
    z-index: -1;
    pointer-events: none;
  }

  .spin {
    position: absolute;
    inset: 0;
    z-index: -2;
    opacity: 0; /* Apagado por defecto */
    overflow: hidden;
    transition: opacity 0.3s ease;
    pointer-events: none;
  }

  /* Solo mostramos la luz cuando hay hover. Eliminamos la regla .active .spin */
  .real-button:hover ~ .button-container .spin {
    opacity: 0.8;
  }

  .spin-blur {
    display: none;
  }

  .spin-intense {
    inset: -1px;
    /* Reducimos el blur para hacer el filtro más pequeño/sutil */
    filter: blur(2px) url(#unopaq2); 
  }

  .spin-inside {
    inset: -1px;
    filter: blur(1px) url(#unopaq3);
    z-index: 0;
  }

  .spin::before {
    content: "";
    position: absolute;
    inset: -100%;
    animation:
      speen 4s linear infinite; /* Un poco más rápido pero solo on hover */
    animation-play-state: paused;
  }

  /* La luz gira SOLO en hover */
  .real-button:hover ~ .button-container .spin::before {
    animation-play-state: running;
  }

  .spin-intense::before {
    background: conic-gradient(from 0deg, transparent 0deg, #65BCF7 90deg, transparent 180deg, #2F7BB8 270deg, transparent 360deg);
  }

  .spin-inside::before {
    background: conic-gradient(from 90deg, transparent 0deg, #65BCF7 90deg, transparent 180deg, #2F7BB8 270deg, transparent 360deg);
  }

  @keyframes speen {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export default CyberNavButton;
