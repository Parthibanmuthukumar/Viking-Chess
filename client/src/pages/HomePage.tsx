import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Diamond, Gamepad2, Globe, Shield, Star, Users, X,
} from 'lucide-react';
import Scene, { MetalColor, PieceColor, PieceType } from '../components/Scene';

// ─────────────────────────────────────────────────────────────
type MetalLabel = Record<MetalColor, string>;
const METAL_LABELS: MetalLabel = {
  chrome: 'CHROME', gold: 'GOLD', rosegold: 'ROSE GOLD', gunmetal: 'GUNMETAL',
};

const HOME_MODES = [
  {
    id: 'hvh',
    icon: <Users size={28} strokeWidth={1.4} />,
    title: 'HUMAN VS HUMAN',
    subtitle: '2 Player · Same Device',
  },
  {
    id: 'cvc',
    icon: <Gamepad2 size={28} strokeWidth={1.4} />,
    title: 'COMPUTER VS HUMAN',
    subtitle: 'Single Player · AI Opponent',
  },
  {
    id: 'online',
    icon: <Globe size={28} strokeWidth={1.4} />,
    title: 'CONNECT WITH FRIEND',
    subtitle: 'Online · Remote Match',
  },
  {
    id: 'join',
    icon: <Users size={28} strokeWidth={1.4} />,
    title: 'JOIN ROOM WITH CODE',
    subtitle: 'Enter room code to connect',
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  const [metalColor,     setMetalColor]     = useState<MetalColor>('chrome');
  const [lightIntensity, setLightIntensity] = useState<number>(1.0);
  const [selectedId,     setSelectedId]     = useState<string>('white-king-4');
  const [showModal,      setShowModal]      = useState<boolean>(false);
  const [countdown,      setCountdown]      = useState<number>(15);
  const [showJoinInput,  setShowJoinInput]  = useState<boolean>(false);
  const [joinRoomCode,   setJoinRoomCode]   = useState<string>('');
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(false);
  
  const [username, setUsername] = useState<string>(() => localStorage.getItem('chess_username') || 'Arjun Verma');
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set body class for home view (tall body enables 3-D scroll rotation)
  useEffect(() => {
    document.body.className = 'view-home';
    return () => { document.body.className = ''; };
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setCountdown(15);
    setShowJoinInput(false);
    setJoinRoomCode('');
    setShowDifficultySelect(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    setCountdown(15);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setShowModal(false);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [showModal]);

  const handleSelectPiece = useCallback(
    (id: string, _type: PieceType, _color: PieceColor) => setSelectedId(id),
    [],
  );

  const lightPct = Math.round(lightIntensity * 100);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `VIKING-${code}`;
  };



  const goToGame = (modeId: string, roomCode?: string, difficulty?: string) => {
    closeModal();
    const roomParam = roomCode ? `&room=${encodeURIComponent(roomCode)}` : '';
    const playerParam = `&player=${encodeURIComponent(username)}`;
    const diffParam = difficulty ? `&difficulty=${difficulty}` : '';
    navigate(`/game?mode=${modeId}${roomParam}${playerParam}${diffParam}`);
  };

  return (
    <div className="home-app">
      {/* 3-D Canvas */}
      <div className="canvas-wrap">
        <Scene
          pieceColor="white"
          metalColor={metalColor}
          roughness={0.5}
          autoRotate={true}
          lightIntensity={lightIntensity}
          selectedId={selectedId}
          onSelect={handleSelectPiece}
        />
      </div>

      {/* Header */}
      <header className="home-header">
        <div className="header-info-desktop">
          <div className="info-tag">
            <span className="info-label">VERSION 2.5.0</span>
          </div>
          <div className="info-tag">
            <span className="info-label">ENGINE: Negamax</span>
          </div>
        </div>

        <div className="home-brand-name">
          <div>VIKING'S</div>
          <div className="home-brand-sub">Master Every Move</div>
          
          {/* Decorative tag for mobile view to fill space beautifully */}
          <div className="mobile-decor-wrap">
            <div className="decor-glow-dot" />
            <span className="decor-text-line">BATTLE OF THE MINDS</span>
            <span className="decor-sub-line">CUSTOM CHESS ENGINE • ZERO STOCKFISH</span>
          </div>
        </div>

        <div className="header-stats-desktop">
          <div className="stat-tag">
            <span className="stat-dot green-pulse" />
            <span className="stat-label">VIKING'S AI: ACTIVE</span>
          </div>
          <div className="stat-tag">
            <span className="stat-dot gold-pulse" />
            <span className="stat-label">MULTIPLAYER: ONLINE</span>
          </div>
        </div>
      </header>

      {/* Left — Play Panel */}
      <aside className="play-panel">
        <h1 className="play-title">KING</h1>
        <p className="play-tagline">THE MOST IMPORTANT PIECE</p>
        

        <button
          id="btn-play"
          className="play-btn"
          onClick={() => setShowModal(true)}
        >
          <span className="play-btn-inner">
            <span className="play-btn-triangle" />
            PLAY NOW
          </span>
        </button>
      </aside>

      {/* Right — Controls Panel */}
      <aside className="ctrl-panel">
        <div className="home-card">
          <div className="card-label">BASE METAL</div>
          <div className="metal-grid">
            {(Object.keys(METAL_LABELS) as MetalColor[]).map(m => (
              <button
                key={m}
                id={`btn-metal-${m}`}
                className={`metal-btn${metalColor === m ? ' on' : ''}`}
                onClick={() => setMetalColor(m)}
              >
                {METAL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="home-card">
          <div className="slider-block">
            <div className="slider-row-top">
              <span className="slider-lbl">Lighting</span>
              <span className="slider-val">{lightPct}%</span>
            </div>
            <input
              id="slider-light"
              type="range"
              min={20}
              max={150}
              value={lightPct}
              style={{
                backgroundImage: 'linear-gradient(var(--gold), var(--gold))',
                backgroundSize: `${Math.min(Math.max(((lightPct - 20) / 130) * 100, 0), 100)}% 100%`,
                backgroundRepeat: 'no-repeat',
              }}
              onChange={e => setLightIntensity(Number(e.target.value) / 100)}
            />
          </div>
        </div>
      </aside>

      {/* Bottom Features Bar */}
      <div className="features-box">
        <div className="feature-item">
          <Shield size={24} className="feature-icon" strokeWidth={1.2} />
          <div className="feature-info">
            <div className="feature-title">ADVANCED AI ENGINE</div>
            <div className="feature-desc">Challenge adaptive computer opponents with various difficulty levels.</div>
          </div>
        </div>
        <div className="feature-item">
          <Diamond size={24} className="feature-icon" strokeWidth={1.2} />
          <div className="feature-info">
            <div className="feature-title">IMMERSIVE 3D VISUALS</div>
            <div className="feature-desc">Beautifully rendered 3D pieces, custom metal colors, and lighting.</div>
          </div>
        </div>
        <div className="feature-item">
          <Crown size={24} className="feature-icon" strokeWidth={1.2} />
          <div className="feature-info">
            <div className="feature-title">VERSATILE GAME MODES</div>
            <div className="feature-desc">Play local pass-and-play, challenge the AI, or invite friends.</div>
          </div>
        </div>
        <div className="feature-item">
          <Star size={24} className="feature-icon" strokeWidth={1.2} />
          <div className="feature-info">
            <div className="feature-title">METALLIC FINISHES</div>
            <div className="feature-desc">Customize your pieces with Chrome, Gold, Rose Gold, and Gunmetal.</div>
          </div>
        </div>
      </div>

      {/* Game Mode Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" id="btn-modal-close" onClick={closeModal}>
              <X size={16} strokeWidth={1.6} />
            </button>
            <div className="modal-timer">{countdown}s</div>

            <div className="modal-eyebrow">SELECT MODE</div>
            <h2 className="modal-title">HOW DO YOU PLAY?</h2>

            {showDifficultySelect ? (
              <div className="difficulty-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <div style={{ color: 'var(--txt-mid)', fontSize: '11px', marginBottom: '8px', textAlign: 'center', letterSpacing: '1px' }}>
                  Select AI opponent level:
                </div>
                {(['easy', 'intermediate', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    className="mode-card"
                    onClick={() => goToGame('cvc', undefined, level)}
                  >
                    <span className="mode-icon" style={{ textTransform: 'uppercase', fontSize: '12px', fontWeight: 'bold' }}>
                      {level[0]}
                    </span>
                    <span className="mode-info">
                      <span className="mode-title" style={{ textTransform: 'uppercase' }}>{level}</span>
                      <span className="mode-sub">
                        {level === 'easy' ? 'Shallow search · 1-ply' : level === 'intermediate' ? 'Medium depth · Heuristics' : 'Strong depth · Minimax search'}
                      </span>
                    </span>
                    <span className="mode-arrow">›</span>
                  </button>
                ))}
                <button
                  className="back-btn"
                  onClick={() => setShowDifficultySelect(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--border-gold)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '12px',
                  }}
                >
                  Back to Modes
                </button>
              </div>
            ) : !showJoinInput ? (
              <div className="mode-list">
                {HOME_MODES.map(mode => (
                  <button
                    key={mode.id}
                    id={`btn-mode-${mode.id}`}
                    className="mode-card"
                    onClick={() => {
                      if (mode.id === 'join') {
                        setShowJoinInput(true);
                      } else if (mode.id === 'online') {
                        goToGame('online', generateRoomCode());
                      } else if (mode.id === 'cvc') {
                        setShowDifficultySelect(true);
                      } else {
                        goToGame(mode.id);
                      }
                    }}
                  >
                    <span className="mode-icon">{mode.icon}</span>
                    <span className="mode-info">
                      <span className="mode-title">{mode.title}</span>
                      <span className="mode-sub">{mode.subtitle}</span>
                    </span>
                    <span className="mode-arrow">›</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="join-room-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                <input
                  type="text"
                  placeholder="ENTER ROOM CODE (e.g. LEO-1234)"
                  value={joinRoomCode}
                  onChange={e => setJoinRoomCode(e.target.value.toUpperCase())}
                  className="room-code-input"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-gold)',
                    background: '#121212',
                    color: '#fff',
                    fontSize: '16px',
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '2px',
                    outline: 'none',
                  }}
                  maxLength={15}
                />
                <button
                  className="confirm-join-btn"
                  onClick={() => {
                    if (joinRoomCode.trim()) {
                      goToGame('online', joinRoomCode.trim());
                    }
                  }}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    background: 'var(--gold, #d4af37)',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    border: 'none',
                    fontSize: '15px',
                    letterSpacing: '1px',
                  }}
                  disabled={!joinRoomCode.trim()}
                >
                  JOIN MATCH
                </button>
                <button
                  className="back-btn"
                  onClick={() => {
                    setShowJoinInput(false);
                    setJoinRoomCode('');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--border-gold)',
                    cursor: 'pointer',
                    fontSize: '14px',
                    marginTop: '4px',
                  }}
                >
                  Back to Modes
                </button>
              </div>
            )}

            <div className="modal-footer-line" />
            <p className="modal-footer-text">VIKING'S · MASTER EVERY MOVE</p>
          </div>
        </div>
      )}
    </div>
  );
}
