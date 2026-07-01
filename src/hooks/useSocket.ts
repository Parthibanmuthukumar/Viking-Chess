import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Server URL — override with VITE_SERVER_URL in .env for LAN / production use
// e.g. VITE_SERVER_URL=http://192.168.1.10:3001
const SERVER = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';

export interface PlayerInfo { name: string; rating: number; playerId?: string; socketId?: string; avatar?: string }
export interface GameStateData {
  gameId: string;
  roomId: string;
  playerWhite?: PlayerInfo;
  playerBlack?: PlayerInfo;
  fen: string;
  pgn: string;
  moves: any[];
  capturedByWhite: string[];
  capturedByBlack: string[];
  timerWhite: number;
  timerBlack: number;
  status: string;
  startedAt: string | null;
}

export interface MoveData {
  move: { from: string; to: string; piece: string; color: string; promotion?: string };
  san: string;
  fen: string;
  pgn: string;
  captured?: string;
  capturedBy?: string;
  capturedByWhite: string[];
  capturedByBlack: string[];
  moveCount: number;
}

export interface GameEndData {
  winner: string;
  reason: string;
  eloChanges: any[];
  moves: number;
  duration: number;
}

export interface RequestData { from: string }

interface UseSocketOptions {
  disabled?: boolean;
  roomId: string;
  playerId: string;
  playerName: string;
  avatar: string;
  rating: number;
  onMove: (data: MoveData) => void;
  onGameStarted: (game: GameStateData) => void;
  onGameEnded: (data: GameEndData) => void;
  onUndoRequest: (data: RequestData) => void;
  onUndoAccepted: (data: any) => void;
  onUndoRejected: () => void;
  onRedoRequest: (data: RequestData) => void;
  onRedoAccepted: (data: any) => void;
  onRedoRejected: () => void;
  onResetRequest: (data: RequestData) => void;
  onResetAccepted: () => void;
  onResetRejected: () => void;
  onRematchRequest: (data: RequestData) => void;
  onRematchAccepted: (game: any) => void;
  onRematchRejected: () => void;
  onChatMessage: (msg: any) => void;
  onChatHistory: (msgs: any[]) => void;
  onEmojiReceive: (e: any) => void;
  onTimerUpdate: (t: { white: number; black: number }) => void;
  onPlayerOnline: (d: { playerName: string; online: boolean }) => void;
  onPlayerReconnected: (d: { playerName: string }) => void;
  onPlayerJoined: (data: { game: GameStateData; playerWhite: PlayerInfo; playerBlack: PlayerInfo }) => void;
  onOpponentDisconnected: (data: { playerName: string }) => void;
}

export interface SocketAPI {
  isConnected: boolean;
  gameId: string | null;
  myColor: 'white' | 'black' | null;
  gameData: GameStateData | null;
  sendMove: (payload: any) => void;
  sendGameOver: (winner: string, reason: string) => void;
  sendResign: () => void;
  requestUndo: () => void;
  respondUndo: (accepted: boolean) => void;
  requestRedo: () => void;
  respondRedo: (accepted: boolean) => void;
  requestReset: () => void;
  respondReset: (accepted: boolean) => void;
  requestRematch: () => void;
  respondRematch: (accepted: boolean) => void;
  closeMatch: () => void;
  sendChat: (message: string) => void;
  sendEmoji: (emoji: string) => void;
  updateProfile: (name: string, avatar: string) => void;
}

export function useSocket(opts: UseSocketOptions): SocketAPI {
  const socketRef  = useRef<Socket | null>(null);
  const optsRef    = useRef(opts);
  optsRef.current  = opts;

  const [isConnected, setIsConnected] = useState(false);
  const [gameId,      setGameId]      = useState<string | null>(null);
  const [myColor,     setMyColor]     = useState<'white'|'black'|null>(null);
  const [gameData,    setGameData]    = useState<GameStateData | null>(null);

  useEffect(() => {
    if (opts.disabled) {
      setIsConnected(false);
      return;
    }
    const socket = io(SERVER, { transports: ['websocket', 'polling'], reconnectionAttempts: 10 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('room:join', {
        roomId:     opts.roomId,
        playerId:   opts.playerId,
        playerName: opts.playerName,
        rating:     opts.rating,
        avatar:     opts.avatar,
      });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('room:joined', ({ gameId: gid, color, game }) => {
      setGameId(gid);
      setMyColor(color);
      setGameData(game);
      if (game) {
        optsRef.current.onGameStarted(game);
      }
    });

    socket.on('game:started',     (game) => { setGameData(game); optsRef.current.onGameStarted(game); });
    socket.on('game:move',        (d)    => { optsRef.current.onMove(d); });
    socket.on('game:ended',       (d)    => { optsRef.current.onGameEnded(d); });
    socket.on('timer:update',     (t)    => { optsRef.current.onTimerUpdate(t); });
    
    socket.on('undo:request',     (d)    => { optsRef.current.onUndoRequest(d); });
    socket.on('undo:accepted',    (d)    => { optsRef.current.onUndoAccepted(d); });
    socket.on('undo:rejected',    ()     => { optsRef.current.onUndoRejected(); });
    
    socket.on('redo:request',     (d)    => { optsRef.current.onRedoRequest(d); });
    socket.on('redo:accepted',    (d)    => { optsRef.current.onRedoAccepted(d); });
    socket.on('redo:rejected',    ()     => { optsRef.current.onRedoRejected(); });

    socket.on('reset:request',    (d)    => { optsRef.current.onResetRequest(d); });
    socket.on('reset:accepted',   ()     => { optsRef.current.onResetAccepted(); });
    socket.on('reset:rejected',   ()     => { optsRef.current.onResetRejected(); });

    socket.on('rematch:request',  (d)    => { optsRef.current.onRematchRequest(d); });
    socket.on('rematch:accepted', ({ game }) => {
      setGameData(game);
      optsRef.current.onRematchAccepted(game);
    });
    socket.on('rematch:rejected', ()     => { optsRef.current.onRematchRejected(); });

    socket.on('chat:message',     (m)    => { optsRef.current.onChatMessage(m); });
    socket.on('chat:history',     (ms)   => { optsRef.current.onChatHistory(ms); });
    socket.on('emoji:receive',    (e)    => { optsRef.current.onEmojiReceive(e); });
    socket.on('player:online',    (d)    => { optsRef.current.onPlayerOnline(d); });
    socket.on('player:reconnected',(d)   => { optsRef.current.onPlayerReconnected(d); });
    
    socket.on('playerJoined',     (d)    => {
      setGameData(d.game);
      optsRef.current.onPlayerJoined(d);
    });
    socket.on('opponent:disconnected', (d) => { optsRef.current.onOpponentDisconnected(d); });

    return () => { socket.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.roomId, opts.playerId]);

  const emit = useCallback((ev: string, data?: any) => {
    socketRef.current?.emit(ev, data);
  }, []);

  return {
    isConnected,
    gameId,
    myColor,
    gameData,
    sendMove:     (p)    => emit('game:move', { ...p, gameId }),
    sendGameOver: (w, r) => emit('game:over',   { gameId, winner: w, reason: r }),
    sendResign:   ()     => emit('game:resign',  { gameId }),
    requestUndo:  ()     => emit('undo:request', { gameId }),
    respondUndo:  (a)    => emit('undo:response',{ gameId, accepted: a }),
    requestRedo:  ()     => emit('redo:request', { gameId }),
    respondRedo:  (a)    => emit('redo:response',{ gameId, accepted: a }),
    requestReset: ()     => emit('reset:request', { gameId }),
    respondReset: (a)    => emit('reset:response',{ gameId, accepted: a }),
    requestRematch:()    => emit('rematch:request', { gameId }),
    respondRematch:(a)   => emit('rematch:response',{ gameId, accepted: a }),
    closeMatch:   ()     => emit('match:close', { gameId }),
    sendChat:     (msg)  => emit('chat:send', { gameId, message: msg }),
    sendEmoji:    (e)    => emit('emoji:send', { gameId, sender: opts.playerName, emoji: e }),
    updateProfile:(n, av)=> emit('player:update-profile', { name: n, avatar: av }),
  };
}
