import {
  useCallback, useEffect, useMemo,
  useRef, useState,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chess } from 'chess.js';
import {
  ChevronLeft, Settings, Flag,
  RotateCcw, RotateCw, RefreshCw, Play,
  Volume2, Copy, Check,
  Gamepad2, MessageSquare, FileText,
  Clock, Star, Send, FlipVertical,
  Trophy, X, Wifi, WifiOff, LayoutGrid, Maximize,
} from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import ChessPiece from '../components/ChessPiece2D';
import { getBestMove, type Difficulty } from '../engine/chessEngine';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GAME_EMOJIS  = ['👏','🔥','😂','😮','💀'];
const PIECE_GLYPHS: Record<string,string> = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};
const FILES = ['a','b','c','d','e','f','g','h'];
const RANKS = ['8','7','6','5','4','3','2','1'];
const INIT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const DEFAULT_ROOM = 'VIKING-ROOM-001';
const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

function fmtTs(iso: string) {
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

function calcEloDisplay(myRating: number, oppRating: number, result: 'win'|'loss'|'draw') {
  const K = 32;
  const E = 1 / (1 + Math.pow(10,(oppRating - myRating)/400));
  const S = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;
  return Math.round(K * (S - E));
}

function getDisplayCoords(sq: string, flipped: boolean) {
  if (typeof sq !== 'string' || sq.length < 2) {
    return { r: 0, c: 0 };
  }
  const file = sq[0];
  const rank = sq[1];
  let c = file.charCodeAt(0) - 97;
  let r = 8 - parseInt(rank);
  if (flipped) {
    c = 7 - c;
    r = 7 - r;
  }
  return { r, c };
}

function playChessSound(type: 'move' | 'capture' | 'check' | 'checkmate' | 'resign', soundOn: boolean) {
  if (!soundOn) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playTone = (freq: number, oscType: OscillatorType, duration: number, startTime: number, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = oscType;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    if (type === 'move') {
      playTone(180, 'sine', 0.1, now, 0.4);
      playTone(90, 'triangle', 0.08, now, 0.3);
    } else if (type === 'capture') {
      playTone(600, 'sine', 0.05, now, 0.35);
      playTone(120, 'triangle', 0.12, now, 0.4);
    } else if (type === 'check') {
      playTone(523.25, 'sine', 0.18, now, 0.3);
      playTone(783.99, 'sine', 0.22, now + 0.1, 0.4);
    } else if (type === 'checkmate') {
      playTone(261.63, 'triangle', 0.5, now, 0.3);
      playTone(329.63, 'triangle', 0.5, now + 0.08, 0.3);
      playTone(392.00, 'triangle', 0.5, now + 0.16, 0.3);
      playTone(523.25, 'sine', 0.6, now + 0.24, 0.4);
      playTone(1046.50, 'sine', 0.8, now + 0.32, 0.2);
    } else if (type === 'resign') {
      playTone(392.00, 'sawtooth', 0.3, now, 0.15);
      playTone(311.13, 'sawtooth', 0.3, now + 0.12, 0.15);
      playTone(261.63, 'sawtooth', 0.5, now + 0.24, 0.15);
    }
  } catch (e) {
    console.error('Audio error:', e);
  }
}

// (AI engine imported from src/engine/chessEngine.ts)

// Build flat board array from chess.js board()
function buildBoardArray(chess: Chess, flipped: boolean) {
  const raw = chess.board(); // 8×8 array of {type,color}|null
  const rows = flipped ? [...raw].reverse().map(r => [...r].reverse()) : raw;
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

// ── Piece renderer (2D premium SVGs)
function PieceGlyph({ piece }: { piece: { type: string; color: string } }) {
  return (
    <ChessPiece
      type={piece.type}
      color={piece.color}
    />
  );
}

// ── PlayerCard
function PlayerCard({
  name, rating, timeSecs, isActive, isOnline, avatarUrl, isPlaceholder, onEditProfile, difficulty,
}: {
  name: string; rating: number; timeSecs: number;
  isActive: boolean; isOnline: boolean; avatarUrl?: string; isPlaceholder?: boolean;
  onEditProfile?: () => void;
  difficulty?: string | null;
}) {
  return (
    <div className="player-card">
      <div className="avatar-wrap">
        <div className="avatar">
          {isPlaceholder ? (
            <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', fill: 'var(--gold, #d4af37)', opacity: 0.85, padding: '10px' }}>
              <circle cx="50" cy="35" r="18" />
              <path d="M50 60c-20 0-30 12-30 20v6h60v-6c0-8-10-20-30-20z" />
            </svg>
          ) : avatarUrl ? (
            <img src={avatarUrl} alt={name} />
          ) : (
            <span className="avatar-initials">{name.slice(0,2).toUpperCase()}</span>
          )}
        </div>
        <div className={`online-dot ${isOnline ? 'online' : 'offline'}`} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div className="player-name">{name}</div>
        {difficulty && (
          <span style={{
            background: 'rgba(212, 175, 55, 0.15)',
            color: 'var(--gold, #d4af37)',
            border: '1px solid #c9a84c',
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '8px',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            {difficulty}
          </span>
        )}
        {onEditProfile && (
          <button
            onClick={onEditProfile}
            style={{
              color: 'var(--gold, #d4af37)',
              cursor: 'pointer',
              opacity: 0.8,
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              border: 'none',
              background: 'transparent',
              padding: '2px',
            }}
            title="Edit Profile"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>
      {!isPlaceholder && <div className="player-rating">ELO {rating}</div>}
      <div className={`timer-box${isActive ? ' timer-active' : ''}`}>
        <Clock size={14} strokeWidth={1.5} className="timer-icon" />
        <span className="timer-text">{fmtTime(timeSecs)}</span>
      </div>
    </div>
  );
}

// ── CapturedRow
function CapturedRow({ pieces, side }: { pieces: string[]; side: 'white'|'black' }) {
  const pieceColor = side === 'white' ? 'b' : 'w';
  return (
    <div className={`captured-row-styled captured-${side}`}>
      {pieces.map((p, i) => (
        <div key={i} className="captured-piece-wrap" style={{ width: '22px', height: '22px' }}>
          <ChessPiece type={p} color={pieceColor} className={`cap-${side}`} />
        </div>
      ))}
      {pieces.length === 0 && <span className="captured-empty">—</span>}
    </div>
  );
}

// ── MoveHistory
function MoveHistory({ moves }: { moves: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [moves.length]);

  const pairs: { n: number; w: string; b: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({ n: Math.floor(i/2)+1, w: moves[i], b: moves[i+1] || '' });
  }

  return (
    <div className="panel-section move-history-section">
      <div className="section-label">MOVE HISTORY</div>
      <div className="move-list" ref={ref}>
        {pairs.length === 0 && <div className="move-empty">No moves yet</div>}
        {pairs.map(({ n, w, b }) => (
          <div key={n} className={`move-row${n === pairs.length ? ' move-active' : ''}`}>
            <span className="move-num">{n}.</span>
            <span className="move-w">{w}</span>
            <span className="move-b">{b}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MatchInfo subcomponent
function MatchInfo({ gameMode, difficulty, movesCount, currentTurn, status }: {
  gameMode: string;
  difficulty: string | null;
  movesCount: number;
  currentTurn: string;
  status: string;
}) {
  const modeName = gameMode === 'cvc' ? "Vs Computer (VIKING'S AI)" : 'Human vs Human (Local)';
  return (
    <div className="panel-section match-info-section" style={{ marginBottom: '16px' }}>
      <div className="section-label">MATCH INFORMATION</div>
      <div className="match-info-grid" style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        padding: '12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '12px'
      }}>
        <div>
          <span style={{ color: 'var(--txt-lo)', display: 'block', fontSize: '9px', letterSpacing: '1px' }}>MODE</span>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{modeName}</span>
        </div>
        {gameMode === 'cvc' && (
          <div>
            <span style={{ color: 'var(--txt-lo)', display: 'block', fontSize: '9px', letterSpacing: '1px' }}>DIFFICULTY</span>
            <span style={{ color: 'var(--gold)', fontWeight: 'bold', textTransform: 'uppercase' }}>{difficulty}</span>
          </div>
        )}
        <div>
          <span style={{ color: 'var(--txt-lo)', display: 'block', fontSize: '9px', letterSpacing: '1px' }}>MOVES</span>
          <span style={{ color: '#fff', fontWeight: 'bold' }}>{movesCount}</span>
        </div>
        <div>
          <span style={{ color: 'var(--txt-lo)', display: 'block', fontSize: '9px', letterSpacing: '1px' }}>TURN</span>
          <span style={{ color: currentTurn === 'w' ? '#fff' : 'var(--gold)', fontWeight: 'bold' }}>
            {currentTurn === 'w' ? 'White' : 'Black'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Chat panel
function ChatPanel({ messages, onSend, isConnected, myName, myPlayerId }: {
  messages: any[]; onSend: (t:string)=>void; isConnected: boolean; myName: string; myPlayerId: string;
}) {
  const [input, setInput] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current && (ref.current.scrollTop = ref.current.scrollHeight); }, [messages.length]);

  const send = () => { if (input.trim()) { onSend(input); setInput(''); }};
  const key = (e: React.KeyboardEvent) => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }};

  const textMsgs = messages.filter(m => m.type === 'text');

  return (
    <div className="panel-section chat-panel">
      <div className="section-label">
        LIVE CHAT
        <span className={`chat-status-dot${isConnected ? ' connected' : ''}`} />
      </div>
      <div className="chat-messages" ref={ref}>
        {textMsgs.length === 0 && <div className="chat-empty">No messages yet. Say hello!</div>}
        {textMsgs.map((m, i) => (
          <div key={m._id||i} className={`chat-msg ${m.senderId === myPlayerId || (m.sender === myName && !m.senderId) ? 'chat-msg-self':'chat-msg-other'}`}>
            <div className="chat-msg-header">
              <span className="chat-msg-sender">{m.sender}</span>
              {m.createdAt && <span className="chat-msg-time">{fmtTs(m.createdAt)}</span>}
            </div>
            <div className="chat-msg-body">{m.message}</div>
          </div>
        ))}
      </div>
      <div className="chat-input-bar">
        <input id="chat-input" className="chat-input" placeholder={isConnected?'Type…':'Connecting…'}
          value={input} onChange={e=>setInput(e.target.value)} onKeyDown={key} disabled={!isConnected} maxLength={500}/>
        <button id="btn-chat-send" className="chat-send-btn" onClick={send} disabled={!isConnected||!input.trim()}>
          <Send size={14} strokeWidth={1.8}/>
        </button>
      </div>
    </div>
  );
}

// ── Emoji panel (Notes tab)
function EmojiPanel({ onSend }: { onSend: (e:string)=>void }) {
  return (
    <div className="panel-section emoji-panel">
      <div className="section-label">QUICK REACTIONS</div>
      <div className="emoji-grid">
        {GAME_EMOJIS.map(e => (
          <button key={e} className="emoji-btn" onClick={() => onSend(e)}>{e}</button>
        ))}
      </div>
      <p className="emoji-hint">Tap to react to your opponent</p>
    </div>
  );
}

// ── Toast
function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = setTimeout(() => {
      onDoneRef.current();
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return <div className="toast">{text}</div>;
}

// ── Notification Modal (undo/redo request)
function RequestModal({ title, from, onAccept, onReject }: {
  title: string; from: string; onAccept: ()=>void; onReject: ()=>void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="req-modal">
        <div className="req-modal-title">{title}</div>
        <div className="req-modal-from">{from} is requesting</div>
        <div className="req-modal-btns">
          <button className="req-btn req-accept" onClick={onAccept}>Accept</button>
          <button className="req-btn req-reject" onClick={onReject}>Reject</button>
        </div>
      </div>
    </div>
  );
}

// ── Promotion Modal
function PromotionModal({ color, onChoose }: { color: 'w'|'b'; onChoose:(p:string)=>void }) {
  const pieces = ['q','r','b','n'];
  return (
    <div className="modal-backdrop">
      <div className="promo-modal">
        <div className="promo-title">PROMOTE PAWN</div>
        <div className="promo-pieces">
          {pieces.map(p => (
            <button key={p} className={`promo-btn piece-${color}`} onClick={() => onChoose(p)}>
              <ChessPiece type={p} color={color} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Profile Modal
function ProfileModal({
  currentName,
  currentAvatar,
  onSave,
  onClose
}: {
  currentName: string;
  currentAvatar: string;
  onSave: (name: string, avatar: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState(currentAvatar);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const avatars = ['avatar-arjun.png', 'avatar-rohan.png', 'avatar-computer.png'];

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSave(name.trim(), avatar);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 90 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '350px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={16} strokeWidth={1.6} />
        </button>
        <div className="modal-eyebrow">PROFILE Settings</div>
        <h2 className="modal-title" style={{ fontSize: '18px', marginBottom: '16px' }}>EDIT PROFILE</h2>

        {error && (
          <div style={{ color: '#dc3c3c', fontSize: '11px', marginBottom: '12px', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px', textAlign: 'left' }}>
          <div>
            <label style={{ display: 'block', color: 'var(--txt-lo)', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '6px' }}>
              Username
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
              }}
              maxLength={20}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: 'var(--txt-lo)', fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px' }}>
              Select Avatar
            </label>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              {avatars.map(av => {
                const isSel = avatar === av;
                return (
                  <button
                    key={av}
                    onClick={() => setAvatar(av)}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: isSel ? '2px solid var(--gold)' : '2px solid var(--border)',
                      padding: 0,
                      cursor: 'pointer',
                      boxShadow: isSel ? '0 0 10px var(--gold-glow)' : 'none',
                      transition: 'all 0.2s',
                    }}
                  >
                    <img src={'/' + av} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={av} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--txt-mid)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: 'var(--gold, #d4af37)',
              color: '#000',
              fontWeight: 'bold',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom Confirmation Modal ──
interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  title,
  message,
  confirmLabel = 'CONFIRM',
  cancelLabel = 'CANCEL',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel} style={{ zIndex: 110 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px', textAlign: 'center' }}>
        <button className="modal-close" onClick={onCancel}>
          <X size={16} strokeWidth={1.6} />
        </button>
        <div className="modal-eyebrow">CONFIRMATION</div>
        <h2 className="modal-title" style={{ fontSize: '18px', marginBottom: '16px', textTransform: 'uppercase' }}>
          {title}
        </h2>
        
        <p style={{ color: 'var(--txt-mid)', fontSize: '13px', marginBottom: '24px', lineHeight: '1.5' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              fontSize: '11px',
              color: 'var(--txt-mid)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              background: 'transparent',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              background: 'var(--gold, #d4af37)',
              color: '#000',
              fontWeight: 'bold',
              fontSize: '11px',
              border: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Settings Modal
function SettingsModal({
  onClose, soundOn, setSoundOn, showHints, setShowHints, boardTheme, setBoardTheme, gameMode, difficulty, onChangeDifficulty
}: {
  onClose: () => void;
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  showHints: boolean;
  setShowHints: (v: boolean) => void;
  boardTheme: string;
  setBoardTheme: (v: any) => void;
  gameMode: string;
  difficulty: string;
  onChangeDifficulty: (v: any) => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 110 }}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '360px', padding: '24px 28px', background: 'rgba(16, 16, 22, 0.98)', border: '1px solid var(--border-gold)', borderRadius: '16px', position: 'relative' }}>
        <button className="modal-close" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--txt-mid)' }}>
          <X size={16} strokeWidth={1.6} />
        </button>
        <div className="modal-eyebrow" style={{ fontSize: '8px', letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '4px' }}>SETTINGS</div>
        <h2 className="modal-title" style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', margin: '0 0 16px 0' }}>GAME PREFERENCES</h2>
        <div className="modal-footer-line" style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.18), transparent)', margin: '12px 0 20px' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Sound Settings */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>Sound Effects</span>
            <Toggle id="settings-sound" on={soundOn} onToggle={() => setSoundOn(!soundOn)} />
          </div>

          {/* Legal Moves Hints */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>Show Move Hints</span>
            <Toggle id="settings-hints" on={showHints} onToggle={() => setShowHints(!showHints)} />
          </div>

          {/* Board Theme Settings */}
          <div>
            <div style={{ color: 'var(--txt-mid)', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500 }}>Board Theme</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {(['sandalwood', 'emerald', 'classic-blue', 'crimson'] as const).map(theme => (
                <button
                  key={theme}
                  onClick={() => setBoardTheme(theme)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    border: boardTheme === theme ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                    background: boardTheme === theme ? 'var(--gold-dim)' : 'var(--surface)',
                    color: boardTheme === theme ? 'var(--gold)' : 'var(--txt-mid)',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                >
                  {theme.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty Setting (only for CvC) */}
          {gameMode === 'cvc' && (
            <div>
              <div style={{ color: 'var(--txt-mid)', fontSize: '11px', marginBottom: '8px', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 500 }}>AI Difficulty</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['easy', 'intermediate', 'hard'] as const).map(level => (
                  <button
                    key={level}
                    onClick={() => onChangeDifficulty(level)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      border: difficulty === level ? '1.5px solid var(--gold)' : '1px solid var(--border)',
                      background: difficulty === level ? 'var(--gold-dim)' : 'var(--surface)',
                      color: difficulty === level ? 'var(--gold)' : 'var(--txt-mid)',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s'
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer-line" style={{ width: '100%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.18), transparent)', margin: '24px 0 12px' }} />
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            background: 'var(--gold)',
            color: '#000',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer',
            border: 'none',
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}
        >
          Save & Close
        </button>
      </div>
    </div>
  );
}

// ── Game End Screen
function GameEndScreen({
  data, myColor, myName, myRating, oppRating, onPlayAgain, onCloseMatch, onReview, startedAt, soundOn, gameMode
}: {
  data: any; myColor: string; myName: string;
  myRating: number; oppRating: number;
  onPlayAgain: ()=>void; onCloseMatch: ()=>void; onReview: ()=>void;
  startedAt: string | null;
  soundOn: boolean;
  gameMode: string;
}) {
  const won   = data.winner === myColor;
  const drew  = data.winner === 'draw';

  let title = drew ? 'Draw' : won ? 'You Won!' : 'You Lost';
  if (gameMode === 'hvh') {
    title = drew ? 'Draw' : data.winner === 'white' ? 'White Won!' : 'Black Won!';
  }

  useEffect(() => {
    if (data.reason === 'checkmate') {
      playChessSound('checkmate', soundOn);
    } else {
      playChessSound('resign', soundOn);
    }
  }, [data.reason, soundOn]);

  const myEloChange = data.eloChanges?.find((c: any) => c.name === myName);
  const delta = myEloChange ? myEloChange.delta : (
    drew
      ? calcEloDisplay(myRating, oppRating, 'draw')
      : won
        ? calcEloDisplay(myRating, oppRating, 'win')
        : calcEloDisplay(myRating, oppRating, 'loss')
  );
  const prevElo = myEloChange ? myEloChange.before : myRating;
  const newElo = myEloChange ? myEloChange.after : myRating + delta;

  const reasonMap: Record<string,string> = {
    checkmate: 'Checkmate', resignation: 'Resignation',
    timeout: 'Timeout', stalemate: 'Stalemate', draw: 'Draw',
    'threefold repetition': 'Threefold Repetition',
    'fifty-move rule': 'Fifty-Move Rule',
    'insufficient material': 'Insufficient Material'
  };

  const fmtDuration = (s: number) => {
    const m = Math.floor(s/60); return `${m}m ${s%60}s`;
  };

  return (
    <div className="modal-backdrop game-end-backdrop">
      <div className="game-end-modal">
        <div className={`end-result-badge ${drew?'draw':(gameMode==='hvh'?'win':(won?'win':'loss'))}`}>
          {drew ? '½-½' : (gameMode==='hvh' ? (data.winner==='white'?'1-0':'0-1') : (won ? '1-0' : '0-1'))}
        </div>
        <div className="end-title">
          {title}
        </div>
        <div className="end-reason">{reasonMap[data.reason] || data.reason}</div>

        <div className="end-stats">
          <div className="end-stat">
            <div className="end-stat-val">{data.moves}</div>
            <div className="end-stat-lbl">MOVES</div>
          </div>
          <div className="end-stat">
            <div className="end-stat-val">{fmtDuration(data.duration || 0)}</div>
            <div className="end-stat-lbl">DURATION</div>
          </div>
          {(gameMode === 'online' || gameMode === 'cvc') && (
            <div className="end-stat">
              <div className={`end-stat-val elo-delta ${delta >= 0 ? 'elo-gain':'elo-loss'}`}>
                {delta >= 0 ? '+' : ''}{delta}
              </div>
              <div className="end-stat-lbl">CHANGE</div>
            </div>
          )}
        </div>

        {(gameMode === 'online' || gameMode === 'cvc') && (
          <div className="elo-summary-box" style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '28px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ color: 'var(--txt-lo)', fontSize: '8px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>PREVIOUS</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{prevElo}</div>
            </div>
            <div style={{ color: 'var(--gold)', fontSize: '16px' }}>➔</div>
            <div>
              <div style={{ color: 'var(--gold)', fontSize: '8px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>NEW RATING</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--gold)' }}>{newElo}</div>
            </div>
          </div>
        )}

        <div className="end-btns">
          <button className="end-btn end-btn-review"   onClick={onReview}>Review Game</button>
          <button className="end-btn end-btn-again"    onClick={onPlayAgain}>Rematch</button>
          <button className="end-btn end-btn-home"     onClick={onCloseMatch}>Close Match</button>
        </div>
      </div>
    </div>
  );
}

// ── Floating emojis
function FloatingEmojis({ emojis }: { emojis: { emoji:string; timestamp:number; x:number }[] }) {
  return (
    <div className="floating-emojis-overlay">
      {emojis.map(e => (
        <div key={e.timestamp} className="floating-emoji" style={{ left: `${e.x}%` }}>{e.emoji}</div>
      ))}
    </div>
  );
}

// ── Toggle switch
function Toggle({ id, on, onToggle }: { id:string; on:boolean; onToggle:()=>void }) {
  return (
    <button id={id} className={`toggle-switch${on?' toggle-on':''}`} onClick={onToggle} role="switch" aria-checked={on}>
      <div className="toggle-thumb"/>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// CHESS BOARD (with drag-and-drop + click-to-move)
// ─────────────────────────────────────────────────────────────
interface BoardProps {
  chess: Chess;
  flipped: boolean;
  myColor: 'white'|'black'|null;
  lastMove: { from:string; to:string } | null;
  onMove: (from:string, to:string, promotion?:string) => boolean;
  gameActive: boolean;
  promotedSquare: string | null;
  aiThinking?: boolean;
  showHints: boolean;
  boardTheme: string;
}

function ChessBoard({ chess, flipped, myColor, lastMove, onMove, gameActive, promotedSquare, aiThinking, showHints, boardTheme }: BoardProps) {
  const [selected, setSelected]           = useState<string|null>(null);
  const [legalSquares, setLegalSquares]   = useState<Set<string>>(new Set());
  const [promoInfo, setPromoInfo]         = useState<{ from:string; to:string } | null>(null);
  const [dragOver, setDragOver]           = useState<string|null>(null);
  const [draggingFrom, setDraggingFrom]   = useState<string|null>(null);

  const board     = buildBoardArray(chess, flipped);
  const turn      = chess.turn(); // 'w' | 'b'
  const myTurn    = myColor ? (myColor === 'white' ? turn === 'w' : turn === 'b') : true;

  const lastMoveDetails = useMemo(() => {
    if (!lastMove) return null;
    const history = chess.history({ verbose: true }) as any[];
    if (history.length === 0) return null;
    const last = history[history.length - 1];
    return {
      from: last.from,
      to: last.to,
      captured: !!(last.captured || last.flags?.includes('c') || last.flags?.includes('e')),
    };
  }, [chess, lastMove]);

  // Convert display (ri,ci) ↔ algebraic based on flip
  const toAlg = (ri: number, ci: number): string => {
    const r = flipped ? ri       : 7 - ri;
    const c = flipped ? 7 - ci  : ci;
    return FILES[c] + (r + 1);
  };

  const selectSquare = (sq: string) => {
    const moves = chess.moves({ square: sq as any, verbose: true });
    setSelected(sq);
    setLegalSquares(new Set(moves.map(m => m.to)));
  };

  const clearSelection = () => {
    setSelected(null);
    setLegalSquares(new Set());
  };

  const tryMove = (from: string, to: string) => {
    // Check for pawn promotion
    const piece = chess.get(from as any);
    if (
      piece?.type === 'p' &&
      ((piece.color === 'w' && to[1] === '8') ||
       (piece.color === 'b' && to[1] === '1'))
    ) {
      setPromoInfo({ from, to });
      clearSelection();
      return;
    }
    onMove(from, to);
    clearSelection();
  };

  const handleSquareClick = (ri: number, ci: number) => {
    if (!gameActive || !myTurn || aiThinking) return;
    const sq    = toAlg(ri, ci);
    const cell  = board[ri][ci];

    if (selected) {
      if (sq === selected) { clearSelection(); return; }

      if (legalSquares.has(sq)) {
        tryMove(selected, sq);
        return;
      }

      // Click own piece → reselect
      if (cell && cell.color === turn) {
        selectSquare(sq);
        return;
      }

      clearSelection();
      return;
    }

    // First click — select own piece
    if (cell && cell.color === turn) {
      selectSquare(sq);
    }
  };

  // ── Drag handlers ──
  const handleDragStart = (e: React.DragEvent, sq: string) => {
    if (!gameActive || !myTurn || aiThinking) { e.preventDefault(); return; }
    const cell = chess.get(sq as any);
    if (!cell || cell.color !== turn) { e.preventDefault(); return; }
    setDraggingFrom(sq);
    selectSquare(sq);
    // Transparent drag image
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(img, 0, 0);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, sq: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(sq);
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = (e: React.DragEvent, ri: number, ci: number) => {
    e.preventDefault();
    setDragOver(null);
    if (!draggingFrom) return;
    const to = toAlg(ri, ci);
    if (legalSquares.has(to)) {
      tryMove(draggingFrom, to);
    } else {
      clearSelection();
    }
    setDraggingFrom(null);
  };

  const handleDragEnd = () => {
    setDragOver(null);
    setDraggingFrom(null);
  };

  const handlePromo = (promo: string) => {
    if (!promoInfo) return;
    onMove(promoInfo.from, promoInfo.to, promo);
    setPromoInfo(null);
  };

  const rankLabels  = flipped ? ['1','2','3','4','5','6','7','8'] : RANKS;
  const fileLabels  = flipped ? [...FILES].reverse() : FILES;

  return (
    <>
      {aiThinking && (
        <div className="ai-thinking-bar">
          <div className="ai-thinking-dots">
            <span /><span /><span />
          </div>
          <span className="ai-thinking-text">VIKING'S AI is thinking…</span>
        </div>
      )}
      <div className={`board-outer theme-${boardTheme}`}>
        <div className="board-with-ranks">
          <div className="rank-labels">
            {rankLabels.map(r => <div key={r} className="rank-label">{r}</div>)}
          </div>
          <div className="board-grid">
            {board.map((row, ri) =>
              row.map((cell, ci) => {
                const sq        = toAlg(ri, ci);
                const isLight   = (ri + ci) % 2 === 0;
                const isLastFr  = lastMove?.from === sq;
                const isLastTo  = lastMove?.to   === sq;
                const isSel     = selected === sq;
                const isLegal   = legalSquares.has(sq);
                const isDragOvr = dragOver === sq;
                const isDragging = draggingFrom === sq;
                
                const isCheck   = chess.isCheck();
                const isKingInCheck = isCheck && cell && cell.type === 'k' && cell.color === chess.turn();

                // Slide animation offsets
                let slideStyle: React.CSSProperties = {};
                let isAnimating = false;

                if (lastMove && lastMove.to === sq && cell) {
                  const fromCoords = getDisplayCoords(lastMove.from, flipped);
                  const toCoords = getDisplayCoords(lastMove.to, flipped);
                  const dr = fromCoords.r - toCoords.r;
                  const dc = fromCoords.c - toCoords.c;
                  slideStyle = {
                    '--slide-x': `${dc * 100}%`,
                    '--slide-y': `${dr * 100}%`,
                  } as React.CSSProperties;
                  isAnimating = true;
                } else if (lastMove && cell && cell.type === 'r') {
                  const isWhiteKingCastle = lastMove.from === 'e1' && lastMove.to === 'g1';
                  const isWhiteQueenCastle = lastMove.from === 'e1' && lastMove.to === 'c1';
                  const isBlackKingCastle = lastMove.from === 'e8' && lastMove.to === 'g8';
                  const isBlackQueenCastle = lastMove.from === 'e8' && lastMove.to === 'c8';
                  
                  let rookFrom: string | null = null;
                  if (sq === 'f1' && isWhiteKingCastle) rookFrom = 'h1';
                  else if (sq === 'd1' && isWhiteQueenCastle) rookFrom = 'a1';
                  else if (sq === 'f8' && isBlackKingCastle) rookFrom = 'h8';
                  else if (sq === 'd8' && isBlackQueenCastle) rookFrom = 'a8';

                  if (rookFrom) {
                    const fromCoords = getDisplayCoords(rookFrom, flipped);
                    const toCoords = getDisplayCoords(sq, flipped);
                    const dr = fromCoords.r - toCoords.r;
                    const dc = fromCoords.c - toCoords.c;
                    slideStyle = {
                      '--slide-x': `${dc * 100}%`,
                      '--slide-y': `${dr * 100}%`,
                    } as React.CSSProperties;
                    isAnimating = true;
                  }
                }

                const isCapturedTo = !!(lastMoveDetails && lastMoveDetails.captured && lastMoveDetails.to === sq);

                const cls = [
                  'board-square',
                  isLight   ? 'sq-light' : 'sq-dark',
                  (isLastFr || isLastTo) ? 'sq-highlight' : '',
                  isSel     ? 'sq-selected' : '',
                  isLegal   ? 'sq-legal'    : '',
                  isKingInCheck ? 'sq-check' : '',
                  isCapturedTo ? 'sq-captured-flash' : '',
                  isDragOvr && isLegal ? 'sq-drag-over' : '',
                ].filter(Boolean).join(' ');

                const isPromoted = promotedSquare === sq;

                return (
                  <div key={`${ri}-${ci}`} id={`sq-${sq}`} className={cls}
                    onClick={() => handleSquareClick(ri, ci)}
                    onDragOver={(e) => handleDragOver(e, sq)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, ri, ci)}
                  >
                    {isLegal && !cell && showHints && <div className="legal-dot" />}
                    {isLegal && cell   && showHints && <div className="legal-capture" />}
                    {cell && (
                      <div
                        className={[
                          'piece-wrap',
                          isDragging ? 'dragging' : '',
                        ].filter(Boolean).join(' ')}
                        draggable
                        onDragStart={(e) => handleDragStart(e, sq)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className={`${isAnimating ? (isCapturedTo ? 'piece-capture-animate' : 'piece-animate') : ''} ${isPromoted ? 'piece-promoted' : ''}`} style={slideStyle}>
                          <ChessPiece type={cell.type} color={cell.color} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="file-labels">
          <div className="rank-labels-spacer" />
          {fileLabels.map(f => <div key={f} className="file-label">{f.toUpperCase()}</div>)}
        </div>
      </div>

      {promoInfo && (
        <PromotionModal
          color={chess.turn()}
          onChoose={handlePromo}
        />
      )}
    </>
  );
}

// ── Gemini API integration
const GEMINI_API_KEY = "AIzaSyDuEIzisMpTpsgUDEHNyV4_LRoyIUedx9U";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

async function getGeminiChatMessage(prompt: string): Promise<string> {
  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 100 }
      })
    });
    if (!response.ok) throw new Error("Gemini API error");
    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error("Gemini error:", error);
    const fallbacks = [
      "Good move! Let me think...",
      "Ah, a challenging position.",
      "Interesting tactic. Let's see how you handle this.",
      "You play well, but can you defeat my algorithm?",
      "Nice play! Let's continue.",
      "Let's see if you can break my defense."
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// ── Chess Heuristic AI for Computer Mode
function evaluateMove(chess: Chess, move: any): number {
  let score = 0;
  if (move.captured) {
    const values: Record<string, number> = { p: 10, n: 30, b: 30, r: 50, q: 90 };
    score += (values[move.captured] || 0) * 10;
  }
  if (move.promotion) {
    score += 80;
  }
  chess.move(move);
  if (chess.isCheckmate()) {
    score += 10000;
  }
  if (chess.isCheck()) {
    score += 20;
  }
  chess.undo();
  const centerSquares = ['d4', 'd5', 'e4', 'e5'];
  if (centerSquares.includes(move.to)) {
    score += 5;
  }
  score += Math.random() * 5;
  return score;
}

const getAvatarForPlayer = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes('arjun')) return '/avatar-arjun.png';
  if (n.includes('rohan')) return '/avatar-rohan.png';
  if (n.includes('computer') || n.includes("viking's ai") || n.includes('leo ai') || n.includes('ai') || n.includes('robot')) return '/avatar-computer.png';
  
  // Deterministic avatar selection based on username hash
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const avatars = ['/avatar-arjun.png', '/avatar-rohan.png'];
  return avatars[Math.abs(hash) % avatars.length];
};

const getAvatarUrl = (avatar: string | undefined) => {
  if (!avatar) return '/avatar-arjun.png';
  if (avatar.startsWith('/')) return avatar;
  return '/' + avatar;
};

// ─────────────────────────────────────────────────────────────
// GAME PAGE
// ─────────────────────────────────────────────────────────────
export default function GamePage() {
  const navigate        = useNavigate();
  const [params, setParams] = useSearchParams();
  const gameMode        = params.get('mode') || 'online'; // 'online', 'cvc', 'hvh'
  const roomId          = params.get('room') || DEFAULT_ROOM;
  const difficulty      = params.get('difficulty') || 'intermediate'; // 'easy', 'intermediate', 'hard'
  const [myName, setMyName] = useState(() => {
    const p = params.get('player');
    if (p && p.trim()) return p;
    const saved = localStorage.getItem('chess_username');
    if (saved && saved.trim()) return saved;
    
    // Generate a premium-sounding random chess username
    const prefixes = ['Grandmaster', 'ChessKing', 'Knight', 'CastleMaster', 'BobbyFischerFan', 'VikingPlayer', 'PawnPusher', 'Bishop', 'RookOwner'];
    const randomNum = Math.floor(100 + Math.random() * 900);
    const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const generated = `${randomPrefix}_${randomNum}`;
    localStorage.setItem('chess_username', generated);
    return generated;
  });
  const [myAvatar, setMyAvatar] = useState(() => localStorage.getItem('viking_chess_avatar') || localStorage.getItem('leo_chess_avatar') || 'avatar-arjun.png');
  const myPlayerId = useMemo(() => {
    // Use localStorage (not sessionStorage) so the ID persists across tabs
    // and Incognito windows on the same device — preventing identity mismatch.
    let id = localStorage.getItem('viking_chess_player_id') || localStorage.getItem('leo_chess_player_id');
    if (!id) {
      id = `p-${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('viking_chess_player_id', id);
    }
    return id;
  }, []);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);

  const showConfirm = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    confirmLabel?: string,
    cancelLabel?: string
  ) => {
    setConfirmModal({
      title,
      message,
      confirmLabel,
      cancelLabel,
      onConfirm: () => {
        onConfirm();
        setConfirmModal(null);
      }
    });
  }, []);
  const myInitialRating = Number(params.get('rating') || 1200);

  // Body class
  useEffect(() => {
    document.body.className = 'view-game';
    return () => { document.body.className = ''; };
  }, []);

  // ── Chess engine ──
  const chessRef = useRef(new Chess());
  const chess    = chessRef.current;
  const [fen,    setFen]    = useState(INIT_FEN);
  const [pgn,    setPgn]    = useState('');
  const [sanMoves, setSanMoves] = useState<string[]>([]);

  // ── UI State ──
  const [activeTab,       setActiveTab]       = useState<'game'|'chat'|'notes'>('game');
  const [soundOn,         setSoundOn]         = useState(() => {
    const saved = localStorage.getItem('chess_pref_sound_on');
    return saved !== null ? saved === 'true' : true;
  });
  const [flipped,         setFlipped]         = useState(false);
  const [lastMove,        setLastMove]        = useState<{from:string;to:string}|null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHints,       setShowHints]       = useState(() => {
    const saved = localStorage.getItem('chess_pref_show_hints');
    return saved !== null ? saved === 'true' : true;
  });
  const [boardTheme,      setBoardTheme]      = useState<'sandalwood'|'emerald'|'classic-blue'|'crimson'>(() => {
    const saved = localStorage.getItem('chess_pref_board_theme') as any;
    return saved || 'sandalwood';
  });
  const [timerWhite,      setTimerWhite]      = useState(10 * 60);
  const [timerBlack,      setTimerBlack]      = useState(10 * 60);
  // Track whether the one-time +3min bonus has been used for each colour
  const [timerBonusUsedWhite, setTimerBonusUsedWhite] = useState(false);
  const [timerBonusUsedBlack, setTimerBonusUsedBlack] = useState(false);
  const [timerZeroAnim, setTimerZeroAnim] = useState<'white'|'black'|null>(null);
  // Mobile panel overlay state
  const [mobilePanelOpen, setMobilePanelOpen] = useState<'history'|'chat'|'controls'|null>(null);

  const [localOppName, setLocalOppName] = useState(() => localStorage.getItem('chess_local_opp_name') || 'Player 2');
  const [localOppAvatar, setLocalOppAvatar] = useState(() => localStorage.getItem('chess_local_opp_avatar') || 'avatar-rohan.png');
  const [profileEditTarget, setProfileEditTarget] = useState<'player1' | 'player2'>('player1');

  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopReplay = useCallback(() => {
    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
    setIsReplaying(false);
  }, []);

  useEffect(() => {
    localStorage.setItem('chess_pref_sound_on', String(soundOn));
  }, [soundOn]);

  useEffect(() => {
    localStorage.setItem('chess_pref_show_hints', String(showHints));
  }, [showHints]);

  useEffect(() => {
    localStorage.setItem('chess_pref_board_theme', boardTheme);
  }, [boardTheme]);
  const [myRating,        setMyRating]        = useState(() => {
    const saved = localStorage.getItem('viking_chess_user_rating') || localStorage.getItem('leo_chess_user_rating');
    if (saved) return Number(saved);
    return 1200; // Starting user ELO
  });
  const [oppRating,       setOppRating]       = useState(() => {
    if (gameMode === 'hvh') {
      const saved = localStorage.getItem('viking_chess_opp_rating') || localStorage.getItem('leo_chess_opp_rating');
      if (saved) return Number(saved);
      return 1200;
    } else if (gameMode === 'cvc') {
      const saved = localStorage.getItem('viking_chess_ai_rating') || localStorage.getItem('leo_chess_ai_rating');
      if (saved) return Number(saved);
      return 1200;
    }
    return 1200;
  });
  const [capturedByWhite, setCapturedByWhite] = useState<string[]>([]);
  const [capturedByBlack, setCapturedByBlack] = useState<string[]>([]);
  const [gameStatus,      setGameStatus]      = useState<'waiting'|'active'|'ended'>('waiting');
  const [gameEndData,     setGameEndData]     = useState<any>(null);
  const [startedAt,       setStartedAt]       = useState<string|null>(null);
  const [promotedSquare,  setPromotedSquare]  = useState<string|null>(null);
  const [aiThinking,      setAiThinking]      = useState(false);

  // Notification state
  const [toasts,         setToasts]         = useState<{id:number;text:string}[]>([]);
  const [activeRequest,  setActiveRequest]  = useState<{ type: 'undo' | 'redo' | 'reset' | 'rematch'; from: string } | null>(null);
  const [disconnectCountdown, setDisconnectCountdown] = useState<number | null>(null);
  const [chatUnread,     setChatUnread]     = useState(0);
  const [floatingEmojis, setFloatingEmojis] = useState<{emoji:string;timestamp:number;x:number}[]>([]);
  const [copied,         setCopied]         = useState(false);
  const [oppOnline,      setOppOnline]      = useState(false);
  const [messages,       setMessages]       = useState<any[]>([]);

  // Undo/redo stacks
  const undoStack = useRef<string[]>([INIT_FEN]); // FEN history
  const redoStack = useRef<string[]>([]);

  const addToast = useCallback((text: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, text }]);
  }, []);


  const removeToast = useCallback((id: number) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  const addChatMessage = useCallback((sender: string, text: string) => {
    setMessages(prev => [
      ...prev,
      {
        _id: String(Date.now() + Math.random()),
        sender,
        message: text,
        type: 'text',
        createdAt: new Date().toISOString()
      }
    ]);
  }, []);

  const triggerAiMoveComment = useCallback((san: string) => {
    const prompt = `You are VIKING'S AI, a chess computer playing black. You just played the move "${san}". Comment on this move or the board state in a short, witty chat message under 15 words.`;
    getGeminiChatMessage(prompt).then(msg => {
      addChatMessage("VIKING'S AI", msg);
    });
  }, [addChatMessage]);

  const handleSaveProfile = async (newName: string, newAvatar: string) => {
    if (gameMode !== 'online' && profileEditTarget === 'player2') {
      localStorage.setItem('chess_local_opp_name', newName);
      localStorage.setItem('chess_local_opp_avatar', newAvatar);
      setLocalOppName(newName);
      setLocalOppAvatar(newAvatar);
      saveActiveGameToDb(chess.fen(), chess.pgn(), sanMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, gameStatus, startedAt);
      addToast('Player 2 profile updated');
      return;
    }
    try {
      const res = await fetch(`${SERVER_URL}/api/player/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldUsername: myName,
          newUsername: newName,
          avatar: newAvatar,
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update profile');
      }
      const data = await res.json();
      localStorage.setItem('chess_username', data.username);
      localStorage.setItem('viking_chess_avatar', data.avatar);
      localStorage.setItem('leo_chess_avatar', data.avatar); // keep legacy key too
      setMyName(data.username);
      setMyAvatar(data.avatar);
      
      const newParams = new URLSearchParams(params);
      newParams.set('player', data.username);
      setParams(newParams);

      if (gameMode === 'online') {
        sock.updateProfile(data.username, data.avatar);
      } else {
        saveActiveGameToDb(chess.fen(), chess.pgn(), sanMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, gameStatus, startedAt);
      }
      addToast('Profile updated successfully');
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  const saveActiveGameToDb = useCallback(async (
    fenStr: string,
    pgnStr: string,
    moves: string[],
    capWhite: string[],
    capBlack: string[],
    tWhite: number,
    tBlack: number,
    statusStr: string,
    startAt: string | null
  ) => {
    if (gameMode === 'online') return;
    let localId = localStorage.getItem('leo_chess_active_local_id');
    if (!localId) {
      localId = `local-${gameMode}-${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('leo_chess_active_local_id', localId);
    }
    const playerWhite = { name: gameMode === 'cvc' ? myName : 'Player 1', rating: myRating };
    const playerBlack = { name: gameMode === 'cvc' ? "VIKING'S AI" : 'Player 2', rating: 1800 };
    
    const body = {
      gameId: localId,
      roomId: `room-${localId}`,
      playerWhite,
      playerBlack,
      fen: fenStr,
      pgn: pgnStr,
      moves: moves.map(m => ({ san: m })),
      capturedByWhite: capWhite,
      capturedByBlack: capBlack,
      timerWhite: tWhite,
      timerBlack: tBlack,
      status: statusStr,
      startedAt: startAt,
    };

    // Cache state synchronously to localStorage for 100% reliable local persistence fallback
    localStorage.setItem(`leo_chess_local_game_state_${localId}`, JSON.stringify(body));

    try {
      await fetch(`${SERVER_URL}/api/game/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.error('Error saving active game to DB:', err);
    }
  }, [gameMode, myName, myRating]);

  // ── Socket ──
  const sock = useSocket({
    disabled: gameMode !== 'online',
    roomId,
    playerId: myPlayerId,
    playerName: myName,
    avatar: myAvatar,
    rating: myInitialRating,

    onGameStarted: (game) => {
      setGameStatus(game.status as any);
      setStartedAt(game.startedAt);

      // Sync name assigned by server (to separate identical local names)
      const isBlackPlayer = game.playerBlack?.playerId === myPlayerId;
      const isWhitePlayer = game.playerWhite?.playerId === myPlayerId;
      if (isWhitePlayer && game.playerWhite?.name && game.playerWhite.name !== myName) {
        setMyName(game.playerWhite.name);
      } else if (isBlackPlayer && game.playerBlack?.name && game.playerBlack.name !== myName) {
        setMyName(game.playerBlack.name);
      }

      // Restore state if rejoining
      if (game.fen !== INIT_FEN) {
        chess.load(game.fen);
        setFen(game.fen);
        setPgn(game.pgn);
        setSanMoves(game.moves.map((m: any) => m.san || m));
        
        if (game.moves && game.moves.length > 0) {
          const last = game.moves[game.moves.length - 1];
          setLastMove({ from: last.from, to: last.to });
        }
      }
      setCapturedByWhite(game.capturedByWhite || []);
      setCapturedByBlack(game.capturedByBlack || []);
      setTimerWhite(game.timerWhite);
      setTimerBlack(game.timerBlack);

      // Re-populate undoStack
      undoStack.current = [INIT_FEN];
      const tempChess = new Chess();
      if (game.moves) {
        for (const m of game.moves) {
          try {
            tempChess.move(m.san || m);
            undoStack.current.push(tempChess.fen());
          } catch {}
        }
      }
    },

    onMove: (data) => {
      // Apply opponent move
      try {
        chess.load(data.fen);
        setFen(data.fen);
        setPgn(data.pgn);
        setSanMoves(prev => {
          // Use moveCount from server as source of truth.
          // Prevents duplicate appends without incorrectly skipping legitimate repeat SANs
          // (e.g., Nf3 played twice at different points is valid and must both appear).
          if (prev.length >= data.moveCount) return prev;
          return [...prev, data.san];
        });
        setLastMove({ from: data.move.from, to: data.move.to });
        setCapturedByWhite(data.capturedByWhite || []);
        setCapturedByBlack(data.capturedByBlack || []);
        undoStack.current.push(data.fen);
        redoStack.current = [];

        if (data.move.promotion) {
          setPromotedSquare(data.move.to);
          setTimeout(() => setPromotedSquare(null), 800);
        }

        // Play audio chime
        if (chess.isCheckmate()) {
          playChessSound('checkmate', soundOn);
        } else if (chess.isCheck()) {
          playChessSound('check', soundOn);
        } else if (data.captured) {
          playChessSound('capture', soundOn);
        } else {
          playChessSound('move', soundOn);
        }

        if (chess.isGameOver()) {
          let winner = 'draw';
          let reason = 'draw';
          if (chess.isCheckmate()) {
            winner = chess.turn() === 'w' ? 'black' : 'white';
            reason = 'checkmate';
          } else if (chess.isStalemate()) {
            reason = 'stalemate';
          } else if (chess.isThreefoldRepetition()) {
            reason = 'threefold repetition';
          } else if (chess.isInsufficientMaterial()) {
            reason = 'insufficient material';
          } else if (chess.isDrawByFiftyMoves()) {
            reason = 'fifty-move rule';
          }
          sock.sendGameOver(winner, reason);
        }
      } catch {}
    },

    onGameEnded: (data) => {
      setGameStatus('ended');
      setGameEndData(data);
      setDisconnectCountdown(null);
    },

    onTimerUpdate: ({ white, black }) => {
      setTimerWhite(white);
      setTimerBlack(black);
    },

    onUndoRequest: (d) => {
      setActiveRequest({ type: 'undo', from: d.from });
      if (d.from === myName) {
        addToast('Undo request sent to opponent.');
      }
    },
    onUndoAccepted: (data) => {
      setActiveRequest(null);
      if (data && data.fen) {
        chess.load(data.fen);
        setFen(data.fen);
        setPgn(data.pgn);
        setSanMoves(data.moves.map((m: any) => m.san || m));
        
        if (data.moves && data.moves.length > 0) {
          const last = data.moves[data.moves.length - 1];
          setLastMove({ from: last.from, to: last.to });
        } else {
          setLastMove(null);
        }
        
        // Rebuild undoStack
        undoStack.current = [INIT_FEN];
        const tempChess = new Chess();
        for (const m of data.moves) {
          try {
            tempChess.move(m.san || m);
            undoStack.current.push(tempChess.fen());
          } catch {}
        }
        redoStack.current = [];
      } else {
        if (undoStack.current.length > 1) {
          undoStack.current.pop();
          const prevFen = undoStack.current[undoStack.current.length - 1];
          chess.load(prevFen);
          setFen(prevFen);
          setSanMoves(prev => prev.slice(0, -1));
          setLastMove(null);
        }
      }
      addToast('Undo accepted');
    },
    onUndoRejected: () => {
      setActiveRequest(null);
      addToast('Undo rejected by opponent');
    },

    onRedoRequest: (d) => {
      setActiveRequest({ type: 'redo', from: d.from });
      if (d.from === myName) {
        addToast('Redo request sent to opponent.');
      }
    },
    onRedoAccepted: (data) => {
      setActiveRequest(null);
      if (data && data.fen) {
        chess.load(data.fen);
        setFen(data.fen);
        setPgn(data.pgn);
        setSanMoves(data.moves.map((m: any) => m.san || m));
        
        if (data.moves && data.moves.length > 0) {
          const last = data.moves[data.moves.length - 1];
          setLastMove({ from: last.from, to: last.to });
        } else {
          setLastMove(null);
        }
        
        // Rebuild undoStack
        undoStack.current = [INIT_FEN];
        const tempChess = new Chess();
        for (const m of data.moves) {
          try {
            tempChess.move(m.san || m);
            undoStack.current.push(tempChess.fen());
          } catch {}
        }
        redoStack.current = [];
      }
      addToast('Redo accepted');
    },
    onRedoRejected: () => {
      setActiveRequest(null);
      addToast('Redo rejected by opponent');
    },

    onResetRequest: (d) => {
      setActiveRequest({ type: 'reset', from: d.from });
      if (d.from === myName) {
        addToast('Reset request sent to opponent.');
      }
    },
    onResetAccepted: () => {
      setActiveRequest(null);
      chess.reset();
      setFen(INIT_FEN);
      setPgn('');
      setSanMoves([]);
      setLastMove(null);
      setCapturedByWhite([]);
      setCapturedByBlack([]);
      undoStack.current = [INIT_FEN];
      redoStack.current = [];
      addToast('Board reset accepted.');
    },
    onResetRejected: () => {
      setActiveRequest(null);
      addToast('Reset rejected by opponent');
    },

    onRematchRequest: (d) => {
      setActiveRequest({ type: 'rematch', from: d.from });
      if (d.from === myName) {
        addToast('Rematch request sent.');
      }
    },
    onRematchAccepted: (game) => {
      setActiveRequest(null);
      chess.reset();
      setFen(INIT_FEN);
      setPgn('');
      setSanMoves([]);
      setLastMove(null);
      setCapturedByWhite([]);
      setCapturedByBlack([]);
      undoStack.current = [INIT_FEN];
      redoStack.current = [];
      setGameStatus('active');
      setGameEndData(null);
      addToast('Rematch started!');
    },
    onRematchRejected: () => {
      setActiveRequest(null);
      addToast('Rematch rejected');
    },

    onChatMessage: (m) => {
      setMessages(prev => [...prev, m]);
      if (activeTab !== 'chat') {
        setChatUnread(n => n + 1);
        if (m.sender !== myName) {
          addToast(`💬 ${m.sender === 'system' ? 'System' : m.sender}: ${m.message.slice(0,40)}`);
        }
      }
    },
    onChatHistory: (ms) => setMessages(ms),

    onEmojiReceive: (e) => {
      const x = 30 + Math.random() * 40;
      setFloatingEmojis(prev => [...prev, { ...e, x }]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(f => f.timestamp !== e.timestamp)), 2200);
    },

    onPlayerOnline: ({ playerName, online }) => {
      if (playerName !== myName) {
        setOppOnline(online);
        if (!online) {
          addToast(`${playerName} left the room`);
          addChatMessage('System', `${playerName} left the room.`);
        } else {
          addToast(`${playerName} joined the room`);
          addChatMessage('System', `${playerName} joined the room.`);
        }
      }
    },
    onPlayerReconnected: ({ playerName }) => {
      if (playerName !== myName) {
        setDisconnectCountdown(null);
        addToast(`${playerName} reconnected`);
        addChatMessage('System', `${playerName} reconnected.`);
      }
    },

    onPlayerJoined: ({ game }) => {
      setGameStatus(game.status as any);

      // Sync name assigned by server (to separate identical local names)
      const isBlackPlayer = game.playerBlack?.playerId === myPlayerId;
      const isWhitePlayer = game.playerWhite?.playerId === myPlayerId;
      if (isWhitePlayer && game.playerWhite?.name && game.playerWhite.name !== myName) {
        setMyName(game.playerWhite.name);
      } else if (isBlackPlayer && game.playerBlack?.name && game.playerBlack.name !== myName) {
        setMyName(game.playerBlack.name);
      }

      setTimerWhite(game.timerWhite);
      setTimerBlack(game.timerBlack);
      setCapturedByWhite(game.capturedByWhite || []);
      setCapturedByBlack(game.capturedByBlack || []);
      setFen(game.fen);
      chess.load(game.fen);
      setPgn(game.pgn);
      setSanMoves(game.moves.map((m: any) => m.san || m));
      setDisconnectCountdown(null);

      // Restore lastMove highlight
      if (game.moves && game.moves.length > 0) {
        const last = game.moves[game.moves.length - 1];
        setLastMove({ from: last.from, to: last.to });
      }

      // Re-populate undoStack
      undoStack.current = [INIT_FEN];
      const tempChess = new Chess();
      if (game.moves) {
        for (const m of game.moves) {
          try {
            tempChess.move(m.san || m);
            undoStack.current.push(tempChess.fen());
          } catch {}
        }
      }
    },

    onOpponentDisconnected: ({ playerName }) => {
      if (playerName !== myName) {
        setDisconnectCountdown(300);
        addToast(`${playerName} disconnected`);
        addChatMessage('System', `${playerName} disconnected.`);
      }
    }
  });

  const handleLeaveGame = useCallback(async () => {
    if (gameMode !== 'online') {
      const activeLocalId = localStorage.getItem('leo_chess_active_local_id');
      if (activeLocalId) {
        try {
          await fetch(`${SERVER_URL}/api/game/${activeLocalId}`, {
            method: 'DELETE',
          });
        } catch (e) {
          console.error('Error deleting game on leave:', e);
        }
        localStorage.removeItem('leo_chess_active_local_id');
        localStorage.removeItem(`leo_timer_w_${activeLocalId}`);
        localStorage.removeItem(`leo_timer_b_${activeLocalId}`);
        localStorage.removeItem(`leo_chess_local_game_state_${activeLocalId}`);
      }
    } else {
      sock.closeMatch();
    }
    navigate('/');
  }, [gameMode, sock, navigate]);

  // Automatically flip board for Black in online mode
  useEffect(() => {
    if (gameMode === 'online' && sock.myColor === 'black') {
      setFlipped(true);
    }
  }, [gameMode, sock.myColor]);

  const myColor = gameMode === 'online'
    ? sock.myColor
    : gameMode === 'cvc'
      ? 'white'
      : null; // null for local means anyone can move on their turn

  const gameId = gameMode === 'online' ? sock.gameId : `local-${gameMode}`;
  const isActive = gameStatus === 'active';

  // Opponent name from socket data
  const oppName = gameMode === 'online'
    ? (sock.myColor === 'white' ? (sock.gameData?.playerBlack?.name || 'Waiting…') : (sock.gameData?.playerWhite?.name || 'Waiting…'))
    : gameMode === 'cvc'
      ? "VIKING'S AI"
      : localOppName;

  const oppRatingVal = gameMode === 'online'
    ? (sock.myColor === 'white' ? (sock.gameData?.playerBlack?.rating || 1789) : (sock.gameData?.playerWhite?.rating || 1789))
    : oppRating;

  const materialDiff = useMemo(() => {
    let val = 0;
    try {
      const board = chess.board();
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece) {
            const pieceVal = piece.type === 'p' ? 100 
                           : piece.type === 'n' ? 300 
                           : piece.type === 'b' ? 300 
                           : piece.type === 'r' ? 500 
                           : piece.type === 'q' ? 900 
                           : 0;
            if (piece.color === 'w') val += pieceVal;
            else val -= pieceVal;
          }
        }
      }
    } catch(e) {}
    return val;
  }, [sanMoves, chess]);

  const liveMyRating = gameStatus === 'active' && gameMode !== 'online'
    ? Math.max(100, Math.round(myRating + (myColor === 'white' ? materialDiff : -materialDiff) * 0.12))
    : myRating;

  const liveOppRating = gameStatus === 'active' && gameMode !== 'online'
    ? Math.max(100, Math.round(oppRatingVal - (myColor === 'white' ? materialDiff : -materialDiff) * 0.12))
    : oppRatingVal;

  const isOppOnline = gameMode === 'online' ? oppOnline : true;

  // Load local game from DB on mount
  useEffect(() => {
    if (gameMode === 'online') return;
    
    const restoreState = (game: any, activeId: string) => {
      try {
        if (!game || typeof game.fen !== 'string') return;
        chessRef.current.load(game.fen);
        setFen(game.fen);
        setPgn(game.pgn || '');
        setSanMoves((game.moves || []).map((m: any) => m.san || m));
        setCapturedByWhite(game.capturedByWhite || []);
        setCapturedByBlack(game.capturedByBlack || []);
        
        const localW = localStorage.getItem(`leo_timer_w_${activeId}`);
        const localB = localStorage.getItem(`leo_timer_b_${activeId}`);
        setTimerWhite(localW ? Number(localW) : (game.timerWhite || 10 * 60));
        setTimerBlack(localB ? Number(localB) : (game.timerBlack || 10 * 60));
        
        setStartedAt(game.startedAt);
        setGameStatus(game.status);
        
        if (game.moves && game.moves.length > 0) {
          const tempChess = new Chess();
          let lastM = null;
          for (const m of game.moves) {
            try {
              const parsedM = tempChess.move(m.san || m);
              lastM = { from: parsedM.from, to: parsedM.to };
            } catch {}
          }
          setLastMove(lastM);
        }
        
        undoStack.current = [INIT_FEN];
        const tempChess = new Chess();
        if (game.moves) {
          for (const m of game.moves) {
            try {
              tempChess.move(m.san || m);
              undoStack.current.push(tempChess.fen());
            } catch {}
          }
        }
      } catch (e) {
        console.error('Failed to restore match state safely:', e);
      }
    };

    const loadLocalGame = async () => {
      const activeLocalId = localStorage.getItem('leo_chess_active_local_id');
      
      // Attempt to load fallback state from localStorage
      let localState: any = null;
      if (activeLocalId) {
        const cached = localStorage.getItem(`leo_chess_local_game_state_${activeLocalId}`);
        if (cached) {
          try {
            localState = JSON.parse(cached);
          } catch {}
        }
      }

      if (activeLocalId) {
        try {
          const res = await fetch(`${SERVER_URL}/api/game/${activeLocalId}`);
          if (res.ok) {
            const game = await res.json();
            if (game && game.status !== 'ended') {
              restoreState(game, activeLocalId);
              return;
            }
          }
        } catch (e) {
          console.error('Failed to load local game from DB, attempting localStorage fallback', e);
        }
      }
      
      // If DB load failed or was empty/ended, try localStorage fallback
      if (localState && localState.status !== 'ended') {
        restoreState(localState, activeLocalId!);
        return;
      }
      
      // Otherwise, start a fresh new game
      const newLocalId = `local-${gameMode}-${Math.random().toString(36).substring(2, 10)}`;
      localStorage.setItem('leo_chess_active_local_id', newLocalId);
      chessRef.current.reset();
      setFen(INIT_FEN);
      setPgn('');
      setSanMoves([]);
      setLastMove(null);
      setCapturedByWhite([]);
      setCapturedByBlack([]);
      setTimerWhite(10 * 60);
      setTimerBlack(10 * 60);
      const startTime = new Date().toISOString();
      setStartedAt(startTime);
      setGameStatus('active');
      undoStack.current = [INIT_FEN];
      redoStack.current = [];
      
      saveActiveGameToDb(INIT_FEN, '', [], [], [], 10 * 60, 10 * 60, 'active', startTime);
    };

    loadLocalGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode]);

  // Initial welcome message in computer mode
  useEffect(() => {
    if (gameMode === 'cvc' && gameStatus === 'active') {
      const welcomePrompt = `You are VIKING'S AI, a chess computer playing black against a human player named ${myName}. Greet them politely but confidently in under 15 words.`;
      getGeminiChatMessage(welcomePrompt).then(msg => {
        addChatMessage("VIKING'S AI", msg);
      });
    }
  }, [gameMode, gameStatus, myName, addChatMessage]);

  // Disconnect countdown interval
  useEffect(() => {
    if (disconnectCountdown === null) return;
    if (disconnectCountdown <= 0) return;
    const timer = setInterval(() => {
      setDisconnectCountdown(c => (c !== null && c > 0 ? c - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [disconnectCountdown]);

  const handleTimeout = useCallback((color: 'white' | 'black') => {
    // Grant one-time +3 minute bonus if not already used
    if (color === 'white' && !timerBonusUsedWhite) {
      setTimerBonusUsedWhite(true);
      setTimerWhite(3 * 60);
      setTimerZeroAnim('white');
      setTimeout(() => setTimerZeroAnim(null), 3000);
      return;
    }
    if (color === 'black' && !timerBonusUsedBlack) {
      setTimerBonusUsedBlack(true);
      setTimerBlack(3 * 60);
      setTimerZeroAnim('black');
      setTimeout(() => setTimerZeroAnim(null), 3000);
      return;
    }

    // Bonus already used – end the game
    const winner = color === 'white' ? 'black' : 'white';
    setGameStatus('ended');
    const elapsed = Math.max(0, Math.floor((Date.now() - (startedAt && !isNaN(Date.parse(startedAt)) ? Date.parse(startedAt) : Date.now())) / 1000));
    const endData = {
      winner,
      reason: 'timeout',
      moves: sanMoves.length,
      duration: elapsed
    };
    setGameEndData(endData);
    setDisconnectCountdown(null);

    if (gameMode !== 'online') {
      if (gameMode === 'cvc') {
        const won = (winner === 'white');
        const delta1 = won ? calcEloDisplay(myRating, oppRatingVal, 'win') : calcEloDisplay(myRating, oppRatingVal, 'loss');
        const delta2 = won ? calcEloDisplay(oppRatingVal, myRating, 'loss') : calcEloDisplay(oppRatingVal, myRating, 'win');
        const newRating = myRating + delta1;
        const newOppRating = oppRatingVal + delta2;
        setMyRating(newRating);
        setOppRating(newOppRating);
        localStorage.setItem('viking_chess_user_rating', String(newRating));
        localStorage.setItem('viking_chess_ai_rating', String(newOppRating));
      } else if (gameMode === 'hvh') {
        const won = (winner === 'white');
        const delta1 = won ? calcEloDisplay(myRating, oppRatingVal, 'win') : calcEloDisplay(myRating, oppRatingVal, 'loss');
        const delta2 = won ? calcEloDisplay(oppRatingVal, myRating, 'loss') : calcEloDisplay(oppRatingVal, myRating, 'win');
        const newRating = myRating + delta1;
        const newOppRating = oppRatingVal + delta2;
        setMyRating(newRating);
        setOppRating(newOppRating);
        localStorage.setItem('viking_chess_user_rating', String(newRating));
        localStorage.setItem('viking_chess_opp_rating', String(newOppRating));
      }
      saveActiveGameToDb(chess.fen(), chess.pgn(), sanMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, 'ended', startedAt);
      localStorage.removeItem('leo_chess_active_local_id');
      playChessSound('resign', soundOn);
    }
  }, [sanMoves, startedAt, gameMode, myRating, chess, capturedByWhite, capturedByBlack, timerWhite, timerBlack, saveActiveGameToDb, soundOn, timerBonusUsedWhite, timerBonusUsedBlack]);

  const checkLocalGameEnd = useCallback((
    tempChess: Chess,
    nextMoves: string[],
    newCapWhite: string[],
    newCapBlack: string[]
  ): boolean => {
    let isOver = false;
    let winner: 'white' | 'black' | 'draw' = 'draw';
    let reason = 'draw';

    if (tempChess.isCheckmate()) {
      isOver = true;
      winner = tempChess.turn() === 'w' ? 'black' : 'white';
      reason = 'checkmate';
    } else if (tempChess.isStalemate()) {
      isOver = true;
      winner = 'draw';
      reason = 'stalemate';
    } else if (tempChess.isThreefoldRepetition()) {
      isOver = true;
      winner = 'draw';
      reason = 'threefold repetition';
    } else if (tempChess.isInsufficientMaterial()) {
      isOver = true;
      winner = 'draw';
      reason = 'insufficient material';
    } else if (tempChess.isDrawByFiftyMoves()) {
      isOver = true;
      winner = 'draw';
      reason = 'fifty-move rule';
    } else if (tempChess.isDraw()) {
      isOver = true;
      winner = 'draw';
      reason = 'draw';
    }

    if (isOver) {
      setGameStatus('ended');
      const elapsed = Math.max(0, Math.floor((Date.now() - (startedAt && !isNaN(Date.parse(startedAt)) ? Date.parse(startedAt) : Date.now())) / 1000));
      const endData = {
        winner,
        reason,
        moves: nextMoves.length,
        duration: elapsed
      };
      setGameEndData(endData);
      
      if (gameMode === 'cvc') {
        const won = (winner === 'white');
        const drew = (winner === 'draw');
        const delta1 = drew
          ? calcEloDisplay(myRating, oppRatingVal, 'draw')
          : won
            ? calcEloDisplay(myRating, oppRatingVal, 'win')
            : calcEloDisplay(myRating, oppRatingVal, 'loss');
        const delta2 = drew
          ? calcEloDisplay(oppRatingVal, myRating, 'draw')
          : won
            ? calcEloDisplay(oppRatingVal, myRating, 'loss')
            : calcEloDisplay(oppRatingVal, myRating, 'win');
        const newRating = myRating + delta1;
        const newOppRating = oppRatingVal + delta2;
        setMyRating(newRating);
        setOppRating(newOppRating);
        localStorage.setItem('leo_chess_user_rating', String(newRating));
        localStorage.setItem('leo_chess_ai_rating', String(newOppRating));
      } else if (gameMode === 'hvh') {
        const won = (winner === 'white');
        const drew = (winner === 'draw');
        const delta1 = drew
          ? calcEloDisplay(myRating, oppRatingVal, 'draw')
          : won
            ? calcEloDisplay(myRating, oppRatingVal, 'win')
            : calcEloDisplay(myRating, oppRatingVal, 'loss');
        const delta2 = drew
          ? calcEloDisplay(oppRatingVal, myRating, 'draw')
          : won
            ? calcEloDisplay(oppRatingVal, myRating, 'loss')
            : calcEloDisplay(oppRatingVal, myRating, 'win');
        const newRating = myRating + delta1;
        const newOppRating = oppRatingVal + delta2;
        setMyRating(newRating);
        setOppRating(newOppRating);
        localStorage.setItem('viking_chess_user_rating', String(newRating));
        localStorage.setItem('viking_chess_opp_rating', String(newOppRating));
      }
      
      saveActiveGameToDb(tempChess.fen(), tempChess.pgn(), nextMoves, newCapWhite, newCapBlack, timerWhite, timerBlack, 'ended', startedAt);
      localStorage.removeItem('leo_chess_active_local_id');
      playChessSound(reason === 'checkmate' ? 'checkmate' : 'resign', soundOn);
      return true;
    }
    return false;
  }, [gameMode, myRating, oppRatingVal, startedAt, saveActiveGameToDb, timerWhite, timerBlack, soundOn]);

  // Offline/computer timer decrement
  useEffect(() => {
    if (gameMode === 'online' || gameStatus !== 'active') return;
    const interval = setInterval(() => {
      if (chess.turn() === 'w') {
        setTimerWhite(t => {
          if (t <= 1) {
            handleTimeout('white');
            return 0;
          }
          return t - 1;
        });
      } else {
        setTimerBlack(t => {
          if (t <= 1) {
            handleTimeout('black');
            return 0;
          }
          return t - 1;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameMode, gameStatus, chess, handleTimeout]);

  // Sync local timers to localStorage for seamless refresh restoration
  useEffect(() => {
    if (gameMode === 'online' || gameStatus !== 'active') return;
    const activeLocalId = localStorage.getItem('leo_chess_active_local_id');
    if (activeLocalId) {
      localStorage.setItem(`leo_timer_w_${activeLocalId}`, String(timerWhite));
      localStorage.setItem(`leo_timer_b_${activeLocalId}`, String(timerBlack));
    }
  }, [timerWhite, timerBlack, gameMode, gameStatus]);

  // ── Make Move ──
  const handleMove = useCallback((from: string, to: string, promotion?: string): boolean => {
    if (!isActive) return false;
    const myTurn = myColor ? (myColor === 'white' ? chess.turn() === 'w' : chess.turn() === 'b') : true;
    if (!myTurn) return false;

    try {
      const moveObj = chess.move({ from: from as any, to: to as any, promotion: promotion as any });
      if (!moveObj) return false;

      const newFen = chess.fen();
      const newPgn = chess.pgn();
      setFen(newFen);
      setPgn(newPgn);
      
      const nextMoves = [...sanMoves, moveObj.san];
      setSanMoves(nextMoves);
      setLastMove({ from, to });
      undoStack.current.push(newFen);
      redoStack.current = [];

      if (promotion) {
        setPromotedSquare(to);
        setTimeout(() => setPromotedSquare(null), 800);
      }

      // Captured piece (store raw piece type letter)
      const captured = moveObj.captured;
      const capturedBy = moveObj.color === 'w' ? 'white' : 'black';

      let nextCapWhite = [...capturedByWhite];
      let nextCapBlack = [...capturedByBlack];

      if (captured) {
        if (capturedBy === 'white') {
          nextCapWhite.push(captured);
          setCapturedByWhite(nextCapWhite);
        } else {
          nextCapBlack.push(captured);
          setCapturedByBlack(nextCapBlack);
        }
      }

      // Play audio chime
      if (chess.isCheckmate()) {
        playChessSound('checkmate', soundOn);
      } else if (chess.isCheck()) {
        playChessSound('check', soundOn);
      } else if (captured) {
        playChessSound('capture', soundOn);
      } else {
        playChessSound('move', soundOn);
      }

      if (gameMode === 'online') {
        sock.sendMove({
          gameId,
          move: { from, to, piece: moveObj.piece, color: moveObj.color, promotion },
          san: moveObj.san,
          fen: newFen,
          pgn: newPgn,
          captured,
          capturedBy,
        });

        if (chess.isGameOver()) {
          let winner = 'draw';
          let reason = 'draw';
          if (chess.isCheckmate()) {
            winner = chess.turn() === 'w' ? 'black' : 'white';
            reason = 'checkmate';
          } else if (chess.isStalemate()) {
            reason = 'stalemate';
          } else if (chess.isThreefoldRepetition()) {
            reason = 'threefold repetition';
          } else if (chess.isInsufficientMaterial()) {
            reason = 'insufficient material';
          } else if (chess.isDrawByFiftyMoves()) {
            reason = 'fifty-move rule';
          }
          sock.sendGameOver(winner, reason);
        }
      } else {
        const ended = checkLocalGameEnd(chess, nextMoves, nextCapWhite, nextCapBlack);
        if (!ended) {
          saveActiveGameToDb(newFen, newPgn, nextMoves, nextCapWhite, nextCapBlack, timerWhite, timerBlack, 'active', startedAt);
        }
      }

      return true;
    } catch {
      return false;
    }
  }, [chess, myColor, isActive, sock, gameId, sanMoves, gameMode, capturedByWhite, capturedByBlack, checkLocalGameEnd, saveActiveGameToDb, timerWhite, timerBlack, startedAt, soundOn]);

  // ── Computer move trigger ──
  useEffect(() => {
    if (gameMode !== 'cvc' || gameStatus !== 'active') return;
    if (chess.turn() !== 'b') return; // Computer plays black

    setAiThinking(true);

    const timer = setTimeout(() => {
      const bestMove = getBestMove(chess, difficulty as Difficulty);
      setAiThinking(false);
      if (!bestMove) return;

      const from = bestMove.from;
      const to = bestMove.to;
      const promotion = bestMove.promotion;

      try {
        const moveObj = chess.move({ from, to, promotion });
        if (!moveObj) return;

        const newFen = chess.fen();
        const newPgn = chess.pgn();
        setFen(newFen);
        setPgn(newPgn);
        
        const nextMoves = [...sanMoves, moveObj.san];
        setSanMoves(nextMoves);
        setLastMove({ from, to });
        undoStack.current.push(newFen);
        redoStack.current = [];

        if (promotion) {
          setPromotedSquare(to);
          setTimeout(() => setPromotedSquare(null), 800);
        }

        // Captured piece (raw type letter)
        const captured = moveObj.captured;
        const capturedBy = moveObj.color === 'w' ? 'white' : 'black';

        let nextCapWhite = [...capturedByWhite];
        let nextCapBlack = [...capturedByBlack];

        if (captured) {
          if (capturedBy === 'white') {
            nextCapWhite.push(captured);
            setCapturedByWhite(nextCapWhite);
          } else {
            nextCapBlack.push(captured);
            setCapturedByBlack(nextCapBlack);
          }
        }

        // Play audio chime
        if (chess.isCheckmate()) {
          playChessSound('checkmate', soundOn);
        } else if (chess.isCheck()) {
          playChessSound('check', soundOn);
        } else if (captured) {
          playChessSound('capture', soundOn);
        } else {
          playChessSound('move', soundOn);
        }

        // Trigger AI chat reaction
        triggerAiMoveComment(moveObj.san);

        // Local game over and persistence
        const ended = checkLocalGameEnd(chess, nextMoves, nextCapWhite, nextCapBlack);
        if (!ended) {
          saveActiveGameToDb(newFen, newPgn, nextMoves, nextCapWhite, nextCapBlack, timerWhite, timerBlack, 'active', startedAt);
        }
      } catch (e) {
        console.error("Computer move error:", e);
      }
    }, 250); // Fast 250ms human-like reaction time

    return () => {
      clearTimeout(timer);
      setAiThinking(false);
    };
  }, [gameMode, gameStatus, fen, chess, difficulty, sanMoves, capturedByWhite, capturedByBlack, checkLocalGameEnd, saveActiveGameToDb, timerWhite, timerBlack, startedAt, soundOn, triggerAiMoveComment]);

  // ── Controls ──
  const handleResign = useCallback(() => {
    if (!isActive) return;
    showConfirm(
      'Resign Match',
      'Are you sure you want to resign? This will award the victory to your opponent.',
      () => {
        if (gameMode === 'online') {
          sock.sendResign();
        } else {
          setGameStatus('ended');
          const winner = gameMode === 'cvc' ? 'black' : (chess.turn() === 'w' ? 'black' : 'white');
          const elapsed = Math.max(0, Math.floor((Date.now() - (startedAt && !isNaN(Date.parse(startedAt)) ? Date.parse(startedAt) : Date.now())) / 1000));
          setGameEndData({
            winner,
            reason: 'resignation',
            moves: sanMoves.length,
            duration: elapsed
          });
          
          if (gameMode === 'cvc') {
            const won = (winner === 'white');
            const delta1 = won ? calcEloDisplay(myRating, oppRatingVal, 'win') : calcEloDisplay(myRating, oppRatingVal, 'loss');
            const delta2 = won ? calcEloDisplay(oppRatingVal, myRating, 'loss') : calcEloDisplay(oppRatingVal, myRating, 'win');
            const newRating = myRating + delta1;
            const newOppRating = oppRatingVal + delta2;
            setMyRating(newRating);
            setOppRating(newOppRating);
            localStorage.setItem('viking_chess_user_rating', String(newRating));
            localStorage.setItem('viking_chess_ai_rating', String(newOppRating));
          } else if (gameMode === 'hvh') {
            const won = (winner === 'white');
            const delta1 = won ? calcEloDisplay(myRating, oppRatingVal, 'win') : calcEloDisplay(myRating, oppRatingVal, 'loss');
            const delta2 = won ? calcEloDisplay(oppRatingVal, myRating, 'loss') : calcEloDisplay(oppRatingVal, myRating, 'win');
            const newRating = myRating + delta1;
            const newOppRating = oppRatingVal + delta2;
            setMyRating(newRating);
            setOppRating(newOppRating);
            localStorage.setItem('leo_chess_user_rating', String(newRating));
            localStorage.setItem('leo_chess_opp_rating', String(newOppRating));
          }
          
          saveActiveGameToDb(chess.fen(), chess.pgn(), sanMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, 'ended', startedAt);
          localStorage.removeItem('leo_chess_active_local_id');
          playChessSound('resign', soundOn);
        }
      },
      'RESIGN',
      'CANCEL'
    );
  }, [isActive, showConfirm, sock, gameMode, chess, sanMoves, myRating, oppRatingVal, capturedByWhite, capturedByBlack, timerWhite, timerBlack, startedAt, saveActiveGameToDb, soundOn]);

  const handleUndoRequest = useCallback(() => {
    stopReplay();
    if (!isActive || sanMoves.length < 1) return;
    if (gameMode === 'online') {
      sock.requestUndo();
      addToast('Undo request sent to opponent.');
    } else {
      if (gameMode === 'cvc') {
        if (undoStack.current.length > 2) {
          undoStack.current.pop();
          undoStack.current.pop();
          const prevFen = undoStack.current[undoStack.current.length - 1];
          chess.load(prevFen);
          setFen(prevFen);
          const nextMoves = sanMoves.slice(0, -2);
          setSanMoves(nextMoves);
          setLastMove(null);
          addToast('Undid moves');

          saveActiveGameToDb(prevFen, chess.pgn(), nextMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, 'active', startedAt);
        }
      } else {
        if (undoStack.current.length > 1) {
          undoStack.current.pop();
          const prevFen = undoStack.current[undoStack.current.length - 1];
          chess.load(prevFen);
          setFen(prevFen);
          const nextMoves = sanMoves.slice(0, -1);
          setSanMoves(nextMoves);
          setLastMove(null);
          addToast('Undid move');

          saveActiveGameToDb(prevFen, chess.pgn(), nextMoves, capturedByWhite, capturedByBlack, timerWhite, timerBlack, 'active', startedAt);
        }
      }
    }
  }, [isActive, sanMoves, sock, addToast, gameMode, chess, capturedByWhite, capturedByBlack, timerWhite, timerBlack, startedAt, saveActiveGameToDb, stopReplay]);

  const handleRedoRequest = useCallback(() => {
    stopReplay();
    if (!isActive) return;
    if (gameMode === 'online') {
      sock.requestRedo();
      addToast('Redo request sent to opponent.');
    } else {
      addToast('Redo is not available in offline mode');
    }
  }, [isActive, sock, addToast, gameMode, stopReplay]);

  const handleReset = useCallback(() => {
    stopReplay();
    if (gameMode === 'online') {
      sock.requestReset();
      addToast('Reset request sent to opponent.');
    } else {
      showConfirm(
        'Reset Game',
        'Reset the game? This will start a new game.',
        () => {
          chess.reset();
          setFen(INIT_FEN);
          setPgn('');
          setSanMoves([]);
          setLastMove(null);
          setCapturedByWhite([]);
          setCapturedByBlack([]);
          undoStack.current = [INIT_FEN];
          redoStack.current = [];
          
          const activeLocalId = localStorage.getItem('leo_chess_active_local_id');
          if (activeLocalId) {
            localStorage.removeItem(`leo_timer_w_${activeLocalId}`);
            localStorage.removeItem(`leo_timer_b_${activeLocalId}`);
            localStorage.removeItem(`leo_chess_local_game_state_${activeLocalId}`);
          }
          setTimerWhite(10 * 60);
          setTimerBlack(10 * 60);
          setGameStatus('active');

          saveActiveGameToDb(INIT_FEN, '', [], [], [], 10 * 60, 10 * 60, 'active', startedAt);
        },
        'RESET',
        'CANCEL'
      );
    }
  }, [chess, gameMode, sock, addToast, startedAt, saveActiveGameToDb, showConfirm, stopReplay]);

  const handleReplay = useCallback(() => {
    if (sanMoves.length === 0) {
      addToast('No moves to replay yet.');
      return;
    }
    if (isReplaying) return;

    setIsReplaying(true);

    if (replayTimeoutRef.current) {
      clearTimeout(replayTimeoutRef.current);
    }

    const totalMoves = sanMoves.length;
    const startIdx = Math.max(0, totalMoves - 4);
    const movesToPlay = sanMoves.slice(startIdx);

    // Save current active state
    const currentFen = chess.fen();
    const currentLastMove = lastMove;

    // Load board state at startIdx
    const tempChess = new Chess();
    for (let i = 0; i < startIdx; i++) {
      tempChess.move(sanMoves[i]);
    }
    const startingFen = tempChess.fen();
    chess.load(startingFen);
    setFen(startingFen);
    setLastMove(null);

    let currentStep = 0;

    const playNextStep = () => {
      if (currentStep >= movesToPlay.length) {
        setIsReplaying(false);
        chess.load(currentFen);
        setFen(currentFen);
        setLastMove(currentLastMove);
        addToast('Replay finished');
        return;
      }

      const moveSan = movesToPlay[currentStep];
      try {
        const moveObj = chess.move(moveSan);
        setFen(chess.fen());
        setLastMove({ from: moveObj.from, to: moveObj.to });
        if (moveObj.captured) playChessSound('capture', soundOn);
        else playChessSound('move', soundOn);
      } catch (e) {
        console.error('Replay error:', e);
      }

      currentStep++;
      replayTimeoutRef.current = setTimeout(playNextStep, 1000);
    };

    replayTimeoutRef.current = setTimeout(playNextStep, 1000);
  }, [sanMoves, chess, lastMove, soundOn, isReplaying, addToast]);

  const copyRoom = useCallback(() => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomId]);

  // ── Prevent accidental navigation/tab closing during an active match ──
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isActive) {
        e.preventDefault();
        e.returnValue = 'Are you sure you want to leave the active match? Your current game progress will be lost.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isActive]);

  // ── Chat tab open → clear unread ──
  useEffect(() => {
    if (activeTab === 'chat') setChatUnread(0);
  }, [activeTab]);

  const handleSendChat = useCallback((text: string) => {
    if (gameMode === 'online') {
      sock.sendChat(text);
    } else {
      addChatMessage(myName, text);
      if (gameMode === 'cvc') {
        const prompt = `You are VIKING'S AI, a chess computer playing black against ${myName}. They just sent you this message in live chat: "${text}". Reply to them in a short, chess-themed, witty chat message under 15 words.`;
        getGeminiChatMessage(prompt).then(msg => {
          addChatMessage("VIKING'S AI", msg);
        });
      }
    }
  }, [gameMode, sock, myName, addChatMessage]);

  const handleSendEmoji = useCallback((emoji: string) => {
    if (gameMode === 'online') {
      sock.sendEmoji(emoji);
    } else {
      const x = 30 + Math.random() * 40;
      const timestamp = Date.now();
      setFloatingEmojis(prev => [...prev, { emoji, timestamp, x }]);
      setTimeout(() => setFloatingEmojis(prev => prev.filter(f => f.timestamp !== timestamp)), 2200);
      
      if (gameMode === 'cvc') {
        setTimeout(() => {
          const compEmoji = GAME_EMOJIS[Math.floor(Math.random() * GAME_EMOJIS.length)];
          const rx = 30 + Math.random() * 40;
          const rts = Date.now();
          setFloatingEmojis(prev => [...prev, { emoji: compEmoji, timestamp: rts, x: rx }]);
          setTimeout(() => setFloatingEmojis(prev => prev.filter(f => f.timestamp !== rts)), 2200);
        }, 1000);
      }
    }
  }, [gameMode, sock]);

  // ── Left panel content ──
  const leftPanelContent = useMemo(() => {
    switch (activeTab) {
      case 'chat':  return <ChatPanel messages={messages} onSend={handleSendChat} isConnected={gameMode !== 'online' ? true : sock.isConnected} myName={myName} myPlayerId={myPlayerId} />;
      case 'notes': return <EmojiPanel onSend={handleSendEmoji} />;
      default:      return <MoveHistory moves={sanMoves} />;
    }
  }, [activeTab, messages, handleSendChat, gameMode, sock.isConnected, myName, myPlayerId, handleSendEmoji, sanMoves]);

  const isLobbyWaiting = gameMode === 'online' && gameStatus === 'waiting';

  const oppAvatar = gameMode === 'online'
    ? ((sock.myColor === 'white' ? sock.gameData?.playerBlack : sock.gameData?.playerWhite) as any)?.avatar
    : gameMode === 'cvc'
      ? 'avatar-computer.png'
      : localOppAvatar;

  const topPlayer = isLobbyWaiting
    ? {
        name: myName,
        rating: liveMyRating,
        secs: timerWhite,
        active: false,
        online: true,
        isPlaceholder: false,
        avatar: myAvatar
      }
    : flipped
      ? { name: myName,  rating: liveMyRating,  secs: myColor==='white'?timerWhite:timerBlack,  active: chess.turn()===(myColor==='white'?'w':'b'), online: true, isPlaceholder: false, avatar: myAvatar }
      : { name: oppName, rating: liveOppRating, secs: myColor==='white'?timerBlack:timerWhite, active: chess.turn()===(myColor==='white'?'b':'w'), online: isOppOnline, isPlaceholder: false, avatar: oppAvatar };

  const botPlayer = isLobbyWaiting
    ? {
        name: 'Waiting for Player...',
        rating: 0,
        secs: timerBlack,
        active: false,
        online: false,
        isPlaceholder: true,
        avatar: undefined
      }
    : flipped
      ? { name: oppName, rating: liveOppRating, secs: myColor==='white'?timerBlack:timerWhite, active: chess.turn()===(myColor==='white'?'b':'w'), online: isOppOnline, isPlaceholder: false, avatar: oppAvatar }
      : { name: myName,  rating: liveMyRating,  secs: myColor==='white'?timerWhite:timerBlack,  active: chess.turn()===(myColor==='white'?'w':'b'), online: true, isPlaceholder: false, avatar: myAvatar };

  return (
    <div className="game-layout">
      {/* Timer Zero Animation Overlay */}
      {timerZeroAnim && (
        <div className="timer-zero-overlay" onClick={() => setTimerZeroAnim(null)}>
          <div className="timer-zero-card">
            <div className="timer-zero-heart">💔</div>
            <div className="timer-zero-tape">🩹</div>
            <div className="timer-zero-msg">+3:00 BONUS!</div>
            <div className="timer-zero-sub">Time extended for {timerZeroAnim === 'white' ? 'White' : 'Black'}</div>
          </div>
        </div>
      )}
      <FloatingEmojis emojis={floatingEmojis} />

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => <Toast key={t.id} text={t.text} onDone={() => removeToast(t.id)} />)}
      </div>

      {/* Active Request Modal */}
      {activeRequest && activeRequest.from !== myName && (
        <RequestModal
          title={`${activeRequest.type.toUpperCase()} REQUEST`}
          from={activeRequest.from}
          onAccept={() => {
            if (activeRequest.type === 'undo') sock.respondUndo(true);
            else if (activeRequest.type === 'redo') sock.respondRedo(true);
            else if (activeRequest.type === 'reset') sock.respondReset(true);
            else if (activeRequest.type === 'rematch') sock.respondRematch(true);
            setActiveRequest(null);
          }}
          onReject={() => {
            if (activeRequest.type === 'undo') sock.respondUndo(false);
            else if (activeRequest.type === 'redo') sock.respondRedo(false);
            else if (activeRequest.type === 'reset') sock.respondReset(false);
            else if (activeRequest.type === 'rematch') sock.respondRematch(false);
            setActiveRequest(null);
          }}
        />
      )}

      {/* Disconnect Countdown Modal */}
      {disconnectCountdown !== null && (
        <div className="modal-backdrop">
          <div className="req-modal" style={{ textAlign: 'center' }}>
            <div className="req-modal-title">OPPONENT RECONNECTING</div>
            <div style={{ color: '#fff', margin: '20px 0', fontSize: '15px' }}>
              Opponent Reconnecting... (<strong style={{ color: 'var(--gold, #d4af37)', fontSize: '24px' }}>{Math.floor(disconnectCountdown / 60)}:{String(disconnectCountdown % 60).padStart(2, '0')}</strong>)
            </div>
          </div>
        </div>
      )}

      {/* Game End Screen */}
      {gameEndData && gameStatus === 'ended' && (
        <GameEndScreen
          data={gameEndData}
          myColor={myColor || 'white'}
          myName={myName}
          myRating={myRating}
          oppRating={oppRatingVal}
          startedAt={startedAt}
          soundOn={soundOn}
          gameMode={gameMode}
          onCloseMatch={() => {
            if (gameMode === 'online') {
              sock.closeMatch();
            }
            navigate('/');
          }}
          onPlayAgain={() => {
            if (gameMode === 'online') {
              sock.requestRematch();
            } else {
              window.location.reload();
            }
          }}
          onReview={() => setGameEndData(null)}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          currentName={profileEditTarget === 'player1' ? myName : localOppName}
          currentAvatar={profileEditTarget === 'player1' ? myAvatar : localOppAvatar}
          onSave={handleSaveProfile}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* ── Header ── */}
      <header className="game-header">
        <div className="header-left">
          <button className="icon-btn" id="btn-back" onClick={() => {
            if (isActive) {
              showConfirm(
                'Leave Game',
                'Are you sure you want to leave the active match? Your current game progress will be lost.',
                handleLeaveGame,
                'LEAVE',
                'CANCEL'
              );
            } else {
              handleLeaveGame();
            }
          }}>
            <ChevronLeft size={20} strokeWidth={1.5}/>
          </button>
          <div className="brand">
            <span className="brand-logo">VIKING'S</span>
            <span className="brand-sep"/>
            <span className="brand-tagline">MASTER EVERY MOVE</span>
          </div>
        </div>

        {/* Room Code */}
        <div className="room-badge" onClick={copyRoom}>
          <span className="room-label">ROOM</span>
          <span className="room-code">{roomId}</span>
          {copied ? <Check size={12} strokeWidth={2} className="room-copy-icon"/> : <Copy size={12} strokeWidth={1.5} className="room-copy-icon"/>}
        </div>

        <div className="header-right">
          <div className={`conn-status ${sock.isConnected?'connected':''}`}>
            {sock.isConnected ? <Wifi size={14}/> : <WifiOff size={14}/>}
          </div>
          <button
            className="icon-btn"
            id="btn-fullscreen"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch((err) => {
                  console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
              } else {
                document.exitFullscreen();
              }
            }}
          >
            <Maximize size={17} strokeWidth={1.5}/>
          </button>
          <button className="icon-btn" id="btn-settings" onClick={() => setShowSettingsModal(true)}><Settings size={17} strokeWidth={1.5}/></button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="game-main">

        {/* LEFT PANEL */}
        <aside className="side-panel left-panel">
          <PlayerCard
            name={topPlayer.name} rating={topPlayer.rating}
            timeSecs={topPlayer.secs} isActive={topPlayer.active} isOnline={topPlayer.online}
            avatarUrl={getAvatarUrl(topPlayer.avatar)}
            isPlaceholder={topPlayer.isPlaceholder}
            onEditProfile={!topPlayer.isPlaceholder ? (flipped ? () => { setProfileEditTarget('player1'); setShowProfileModal(true); } : (gameMode === 'hvh' ? () => { setProfileEditTarget('player2'); setShowProfileModal(true); } : undefined)) : undefined}
            difficulty={gameMode === 'cvc' && !flipped ? difficulty : null}
          />
          <div className="panel-section">
            <div className="section-label">CAPTURED PIECES</div>
            <CapturedRow pieces={flipped ? capturedByWhite : capturedByBlack} side={flipped ? 'white' : 'black'} />
          </div>

          {gameMode === 'online' && (
            <div className="panel-tabs">
              {([
                { id: 'game',  Icon: Gamepad2,      label: 'MOVES', badge: 0 },
                { id: 'chat',  Icon: MessageSquare, label: 'CHAT',  badge: chatUnread },
                { id: 'notes', Icon: FileText,       label: 'NOTES', badge: 0 },
              ] as const).map(({ id, Icon, label, badge }) => (
                <button key={id} id={`tab-${id}`}
                  className={`panel-tab${activeTab === id ? ' tab-active' : ''}`}
                  onClick={() => setActiveTab(id)}>
                  <Icon size={12} strokeWidth={1.6}/>
                  <span>{label}</span>
                  {badge > 0 && <span className="tab-badge">{badge}</span>}
                </button>
              ))}
            </div>
          )}

          {gameMode === 'online' ? leftPanelContent : (
            <>
              <MatchInfo
                gameMode={gameMode}
                difficulty={gameMode === 'cvc' ? difficulty : null}
                movesCount={sanMoves.length}
                currentTurn={chess.turn()}
                status={chess.isCheck() ? 'CHECK' : 'NORMAL'}
              />
              <MoveHistory moves={sanMoves} />
            </>
          )}
        </aside>

        {/* CENTER — Board & Controls Bar */}
        <section className="board-section">
          <div className="board-container-wrapper">
            {isLobbyWaiting && (
              <div className="board-waiting-header" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
                padding: '12px 20px',
                borderRadius: '8px',
                border: '1px solid var(--border-gold)',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                gap: '8px',
                width: '100%'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="waiting-pulse-dot" style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--gold, #d4af37)',
                    boxShadow: '0 0 10px var(--gold)',
                    animation: 'statusPulse 1.8s ease-in-out infinite'
                  }} />
                  <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 'bold', letterSpacing: '2px' }}>WAITING FOR OPPONENT...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#fff', fontSize: '15px', letterSpacing: '1px' }}>
                    Room: <strong style={{ color: 'var(--gold, #d4af37)', fontFamily: 'monospace', fontSize: '16px' }}>{roomId}</strong>
                  </span>
                  <button
                    onClick={copyRoom}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--gold, #d4af37)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                    }}
                    title="Copy Room Code"
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}
            {chess.isCheck() && !chess.isCheckmate() && (
              <div className="check-banner">
                <span className="check-banner-icon">⚠</span>
                <span className="check-banner-text">CHECK</span>
              </div>
            )}

            <div className="board-view-container">
              <ChessBoard
                chess={chess}
                flipped={flipped}
                myColor={myColor}
                lastMove={lastMove}
                onMove={handleMove}
                gameActive={isActive && !isReplaying}
                promotedSquare={promotedSquare}
                showHints={showHints}
                boardTheme={boardTheme}
              />
            </div>

            {/* Under-Board Controls Bar */}
            <div className="board-controls-bar">
              {/* Left: Turn / Status Info */}
              <div className="controls-bar-left">
                <div className={`status-dot${isActive ? '' : ' status-dot-off'}`} />
                <div className="status-info">
                  <span className="status-turn">
                    {gameStatus === 'waiting' ? 'Waiting for opponent'
                     : gameStatus === 'ended' ? 'Game Over'
                     : chess.turn() === 'w' ? "White's Turn" : "Black's Turn"}
                  </span>
                  <span className="status-sub">
                    {isActive
                      ? (chess.isCheck() ? '⚠ Check!' : 'Make your move')
                      : gameStatus === 'waiting' ? `Room: ${roomId}` : 'Match ended'}
                  </span>
                </div>
              </div>

              {/* Center/Right: Switch Toggles */}
              <div className="controls-bar-center" style={{ width: '68%', justifyContent: 'flex-end', gap: '24px' }}>
                <div className="toggle-group-item">
                  <span className="toggle-label-text">SOUND</span>
                  <Toggle id="btn-sound" on={soundOn} onToggle={() => setSoundOn(v => !v)} />
                </div>
                <div className="toggle-group-item" style={{ opacity: sanMoves.length > 0 ? 0.4 : 1 }}>
                  <span className="toggle-label-text">FLIP</span>
                  <Toggle
                    id="btn-flip-toggle"
                    on={flipped}
                    onToggle={() => {
                      if (sanMoves.length === 0) setFlipped(v => !v);
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT PANEL */}
        <aside className="side-panel right-panel">
          <PlayerCard
            name={botPlayer.name} rating={botPlayer.rating}
            timeSecs={botPlayer.secs} isActive={botPlayer.active} isOnline={botPlayer.online}
            avatarUrl={getAvatarUrl(botPlayer.avatar)}
            isPlaceholder={botPlayer.isPlaceholder}
            onEditProfile={!botPlayer.isPlaceholder ? (!flipped ? () => { setProfileEditTarget('player1'); setShowProfileModal(true); } : (gameMode === 'hvh' ? () => { setProfileEditTarget('player2'); setShowProfileModal(true); } : undefined)) : undefined}
            difficulty={gameMode === 'cvc' && flipped ? difficulty : null}
          />
          <div className="panel-section">
            <div className="section-label">CAPTURED PIECES</div>
            <CapturedRow pieces={flipped ? capturedByBlack : capturedByWhite} side={flipped ? 'black' : 'white'} />
          </div>

          {/* Engine Eval */}
          <div className="panel-section">
            <div className="section-label">POSITION</div>
            <div className="position-info">
              {isReplaying ? (
                <span className="pos-badge warning anim-pulse">REPLAY ACTIVE</span>
              ) : (
                <>
                  {chess.isCheck()     && <span className="pos-badge check">CHECK</span>}
                  {chess.isCheckmate() && <span className="pos-badge checkmate">CHECKMATE</span>}
                  {chess.isStalemate() && <span className="pos-badge stalemate">STALEMATE</span>}
                  {chess.isDraw()      && <span className="pos-badge draw-badge">DRAW</span>}
                  {!chess.isCheck() && !chess.isCheckmate() && !chess.isStalemate() && !chess.isDraw() && (
                    <span className="pos-badge neutral">{chess.turn()==='w'?'WHITE':'BLACK'} TO MOVE</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Game Controls — no Hint */}
          <div className="panel-section">
            <div className="section-label">GAME CONTROLS</div>
            <div className="controls-grid">
              <button id="btn-undo"   className="ctrl-btn" onClick={handleUndoRequest}>
                <RotateCcw size={15} strokeWidth={1.5}/><span>UNDO</span>
                {activeRequest?.type === 'undo' && activeRequest.from !== myName && <span className="ctrl-badge">!</span>}
              </button>
              <button id="btn-redo"   className="ctrl-btn" onClick={handleRedoRequest}>
                <RotateCw  size={15} strokeWidth={1.5}/><span>REDO</span>
                {activeRequest?.type === 'redo' && activeRequest.from !== myName && <span className="ctrl-badge">!</span>}
              </button>
              <button id="btn-reset"  className="ctrl-btn" onClick={handleReset}>
                <RefreshCw size={15} strokeWidth={1.5}/><span>RESET</span>
              </button>
              <button id="btn-replay" className="ctrl-btn" onClick={handleReplay}>
                <Play      size={15} strokeWidth={1.5}/><span>REVIEW</span>
              </button>
              <button id="btn-resign" className="ctrl-btn ctrl-btn-resign" onClick={handleResign}>
                <Flag      size={15} strokeWidth={1.5}/><span>RESIGN</span>
              </button>
            </div>
          </div>
        </aside>
      </main>

      {/* ── Mobile Bottom Icon Bar ── */}
      <div className="mobile-icon-bar">
        <button
          className={`mobile-icon-tab${mobilePanelOpen === 'history' ? ' active' : ''}`}
          onClick={() => setMobilePanelOpen(p => p === 'history' ? null : 'history')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
          <span>History</span>
        </button>
        <button
          className={`mobile-icon-tab${mobilePanelOpen === 'chat' ? ' active' : ''}`}
          onClick={() => setMobilePanelOpen(p => p === 'chat' ? null : 'chat')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </button>
        <button
          className={`mobile-icon-tab${mobilePanelOpen === 'controls' ? ' active' : ''}`}
          onClick={() => setMobilePanelOpen(p => p === 'controls' ? null : 'controls')}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="1.6" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93L4.93 19.07M4.93 4.93l14.14 14.14"/><circle cx="12" cy="12" r="10"/></svg>
          <span>Controls</span>
        </button>
      </div>

      {/* ── Mobile Panel Overlays ── */}
      {mobilePanelOpen && (
        <div className="mobile-panel-overlay" onClick={() => setMobilePanelOpen(null)}>
          <div className="mobile-panel-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-panel-handle" onClick={() => setMobilePanelOpen(null)} />

            {mobilePanelOpen === 'history' && (
              <>
                <div className="mobile-panel-title">HISTORY &amp; CAPTURES</div>
                <div className="mobile-panel-section">
                  <div className="section-label">CAPTURED PIECES</div>
                  <CapturedRow pieces={capturedByBlack} side="black" />
                  <CapturedRow pieces={capturedByWhite} side="white" />
                </div>
                <MoveHistory moves={sanMoves} />
              </>
            )}

            {mobilePanelOpen === 'chat' && (
              <>
                <div className="mobile-panel-title">CHAT &amp; NOTES</div>
                <ChatPanel
                  messages={messages}
                  onSend={handleSendChat}
                  isConnected={gameMode !== 'online' ? true : sock.isConnected}
                  myName={myName}
                  myPlayerId={myPlayerId}
                />
                <EmojiPanel onSend={handleSendEmoji} />
              </>
            )}

            {mobilePanelOpen === 'controls' && (
              <>
                <div className="mobile-panel-title">GAME CONTROLS</div>
                <div className="controls-grid" style={{ padding: '12px 0' }}>
                  <button id="btn-undo-m" className="ctrl-btn" onClick={() => { handleUndoRequest(); setMobilePanelOpen(null); }}>
                    <RotateCcw size={15} strokeWidth={1.5}/><span>UNDO</span>
                  </button>
                  <button id="btn-redo-m" className="ctrl-btn" onClick={() => { handleRedoRequest(); setMobilePanelOpen(null); }}>
                    <RotateCw size={15} strokeWidth={1.5}/><span>REDO</span>
                  </button>
                  <button id="btn-reset-m" className="ctrl-btn" onClick={() => { handleReset(); setMobilePanelOpen(null); }}>
                    <RefreshCw size={15} strokeWidth={1.5}/><span>RESET</span>
                  </button>
                  <button id="btn-replay-m" className="ctrl-btn" onClick={() => { handleReplay(); setMobilePanelOpen(null); }}>
                    <Play size={15} strokeWidth={1.5}/><span>REVIEW</span>
                  </button>
                  <button id="btn-resign-m" className="ctrl-btn ctrl-btn-resign" onClick={() => { handleResign(); setMobilePanelOpen(null); }}>
                    <Flag size={15} strokeWidth={1.5}/><span>RESIGN</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          soundOn={soundOn}
          setSoundOn={setSoundOn}
          showHints={showHints}
          setShowHints={setShowHints}
          boardTheme={boardTheme}
          setBoardTheme={setBoardTheme}
          gameMode={gameMode}
          difficulty={difficulty}
          onChangeDifficulty={(level: string) => {
            setShowSettingsModal(false);
            const roomParam = roomId ? `&room=${encodeURIComponent(roomId)}` : '';
            const playerParam = `&player=${encodeURIComponent(myName)}`;
            navigate(`/game?mode=cvc${roomParam}${playerParam}&difficulty=${level}`);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
