import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { createServer } from 'http'
import { Server as SocketIO } from 'socket.io'
import { randomUUID } from 'crypto'
import connectDB from './db.js'
import { ChatMessage, ActiveGame, User, Room, MatchHistory, EloHistory } from './models.js'
import { Chess } from 'chess.js'

const app  = express()
const PORT = process.env.PORT || 3001

// Base allowed origins for local dev
const BASE_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]

// Extra origins from environment (comma-separated, e.g. for LAN/production)
// Example .env entry: ALLOWED_ORIGINS=http://192.168.1.10:5173,https://mygame.com
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const ALLOWED = [...BASE_ORIGINS, ...EXTRA_ORIGINS]

console.log(`✅ CORS allowed origins: ${ALLOWED.join(', ')}`)

// Dynamic CORS function — also logs unexpected origins in dev for easier debugging
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, Postman, curl)
    if (!origin || ALLOWED.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`⛔ CORS blocked: ${origin}`)
      callback(new Error(`Origin ${origin} not allowed by CORS`))
    }
  },
  methods: ['GET', 'POST'],
}

app.use(cors(corsOptions))
app.use(express.json())

connectDB()

const httpServer = createServer(app)
const io = new SocketIO(httpServer, {
  cors: corsOptions,
  pingTimeout: 20000,
  pingInterval: 10000,
})

// ── ELO calculation ───────────────────────────────────────────
function calcElo(rA, rB, scoreA) {
  const K  = 32
  const EA = 1 / (1 + Math.pow(10, (rB - rA) / 400))
  const deltaA = Math.round(K * (scoreA - EA))
  return { deltaA, deltaB: -deltaA }
}

// ── Chat rate limiting (per socket) ──────────────────────────
const chatTimestamps = new Map() // socketId → [timestamps]
function isSpam(socketId) {
  const now  = Date.now()
  const prev = (chatTimestamps.get(socketId) || []).filter(t => now - t < 10000)
  if (prev.length >= 10) return true // slightly higher limit for system requests
  chatTimestamps.set(socketId, [...prev, now])
  return false
}

// ── In-memory game timers ─────────────────────────────────────
const gameTimers = new Map() // gameId → { interval, lastTick }

function stopTimer(gameId) {
  const t = gameTimers.get(gameId)
  if (t) { clearInterval(t.interval); gameTimers.delete(gameId) }
}

async function startTimer(gameId) {
  stopTimer(gameId)
  let lastTick = Date.now()

  const interval = setInterval(async () => {
    const game = await ActiveGame.findOne({ gameId })
    if (!game || game.status !== 'active') { stopTimer(gameId); return }

    const now     = Date.now()
    const elapsed = Math.floor((now - lastTick) / 1000)
    lastTick      = now
    if (elapsed <= 0) return

    const turn = game.fen.split(' ')[1] // 'w' or 'b'
    if (turn === 'w') {
      game.timerWhite = Math.max(0, game.timerWhite - elapsed)
      if (game.timerWhite === 0) {
        await endGame(game, 'black', 'timeout')
        return
      }
    } else {
      game.timerBlack = Math.max(0, game.timerBlack - elapsed)
      if (game.timerBlack === 0) {
        await endGame(game, 'white', 'timeout')
        return
      }
    }

    await game.save()
    io.to(gameId).emit('timer:update', {
      white: game.timerWhite,
      black: game.timerBlack,
    })
  }, 1000)

  gameTimers.set(gameId, { interval, lastTick })
}

// ── Send system messages ──────────────────────────────────────
async function sendSystemMessage(gameId, messageText) {
  try {
    const doc = await ChatMessage.create({
      gameId,
      sender: 'system',
      message: messageText,
      type: 'system'
    })
    io.to(gameId).emit('chat:message', {
      _id: doc._id,
      gameId,
      sender: 'system',
      message: messageText,
      type: 'system',
      createdAt: doc.createdAt
    })
  } catch (err) {
    console.error('sendSystemMessage error:', err)
  }
}

async function endGame(game, winner, reason) {
  stopTimer(game.gameId)
  game.status    = 'ended'
  // Schedule auto-deletion via TTL index: 7 days after game ends
  game.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await game.save()

  // ELO update
  const wName = game.playerWhite?.name
  const bName = game.playerBlack?.name
  let eloChanges = []
  
  if (wName && bName) {
    const pW = await User.findOne({ username: wName })
    const pB = await User.findOne({ username: bName })
    if (pW && pB) {
      const score = winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5
      const { deltaA, deltaB } = calcElo(pW.rating, pB.rating, score)

      const wAfter = pW.rating + deltaA
      const bAfter = pB.rating + deltaB

      pW.rating = wAfter
      pB.rating = bAfter
      if (winner === 'white')      { pW.wins++;  pB.losses++ }
      else if (winner === 'black') { pW.losses++; pB.wins++  }
      else                         { pW.draws++;  pB.draws++ }
      pW.gamesPlayed++; pB.gamesPlayed++
      
      await pW.save()
      await pB.save()

      await EloHistory.create({ username: wName, gameId: game.gameId, delta: deltaA, after: wAfter })
      await EloHistory.create({ username: bName, gameId: game.gameId, delta: deltaB, after: bAfter })

      eloChanges = [
        { name: wName, before: pW.rating - deltaA, after: wAfter, delta: deltaA },
        { name: bName, before: pB.rating - deltaB, after: bAfter, delta: deltaB },
      ]
    }
  }

  // Save to match history
  const duration = game.startedAt ? Math.floor((Date.now() - game.startedAt.getTime()) / 1000) : 0
  const history = await MatchHistory.create({
    gameId: game.gameId,
    roomId: game.roomId,
    playerWhite: game.playerWhite,
    playerBlack: game.playerBlack,
    winner,
    reason,
    moves: game.moves.length,
    duration,
    pgn: game.pgn,
    eloChanges,
  })

  // Send system message
  const reasonStr = reason === 'checkmate' ? 'Checkmate' : reason === 'resignation' ? 'Resignation' : 'Timeout'
  const winnerStr = winner === 'draw' ? 'Draw' : `${winner === 'white' ? wName : bName} won`
  await sendSystemMessage(game.gameId, `Match ended. ${winnerStr} by ${reasonStr}.`)

  io.to(game.gameId).emit('game:ended', {
    winner,
    reason,
    eloChanges,
    moves: game.moves.length,
    duration,
  })
}

function recalculateGameState(game) {
  const c = new Chess()
  for (const m of game.moves) {
    try {
      c.move(m.san || m)
    } catch (err) {
      console.error('Error replaying move in recalculateGameState:', err)
    }
  }
  game.fen = c.fen()
  game.pgn = c.pgn()
}

// ── Disconnect timeout stores ─────────────────────────────────
const disconnectTimeouts = new Map() // gameId + playerId/playerName → timeoutRef

// ══════════════════════════════════════════════════════════════
// Socket.io
// ══════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] SOCKET CONNECTED [${socket.id}]`)

  // ── Join / Create Room ────────────────────────────────────
  socket.on('room:join', async ({ roomId, playerId, playerName, rating, avatar }) => {
    try {
      if (!playerId) {
        playerId = playerName;
      }
      
      const ts = () => new Date().toISOString();

      // Find the room first
      let room = await Room.findOne({ roomId });
      let game = await ActiveGame.findOne({ roomId, status: { $ne: 'ended' } }).sort({ createdAt: -1 });

      if (!room) {
        // Create new active game & room
        const gameId = randomUUID().replace(/-/g,'').slice(0,10)
        
        const hostPlayerObj = {
          playerId,
          socketId: socket.id,
          name: playerName,
          rating: rating || 1200,
          avatar: avatar || 'avatar-arjun.png'
        };

        game = await ActiveGame.create({
          gameId,
          roomId,
          playerWhite: hostPlayerObj,
          timerWhite: 10 * 60,
          timerBlack: 10 * 60,
          status: 'waiting',
          connectedPlayers: [playerId],
        })

        room = await Room.create({
          roomId,
          hostSocketId: socket.id,
          hostName: playerName,
          guestSocketId: null,
          guestName: null,
          status: 'waiting',
          gameState: gameState(game),
          moveHistory: [],
          chatMessages: [],
          closedBy: [],
        })

        socket.join(roomId)
        socket.join(gameId)
        socket.data.gameId     = gameId
        socket.data.roomId     = roomId
        socket.data.playerId   = playerId
        socket.data.playerName = playerName
        socket.data.color      = 'white'

        socket.emit('room:joined', { gameId, color: 'white', game: gameState(game) })
        await sendSystemMessage(gameId, `${playerName} joined the room.`)
        
        console.log(`[${ts()}] ROOM CREATED [${roomId}]`)
      } else {
        // Room exists
        if (!game) {
          // If room exists but no active game document, create one
          const gameId = randomUUID().replace(/-/g,'').slice(0,10)
          game = await ActiveGame.create({
            gameId,
            roomId,
            playerWhite: {
              playerId: room.hostName, // fallback
              socketId: room.hostSocketId,
              name: room.hostName,
              rating: 1200,
              avatar: 'avatar-arjun.png'
            },
            timerWhite: 10 * 60,
            timerBlack: 10 * 60,
            status: room.status,
            connectedPlayers: [],
          });
        }

        const gameId = game.gameId;

        // Join socket rooms
        socket.join(roomId)
        socket.join(gameId)
        socket.data.gameId     = gameId
        socket.data.roomId     = roomId
        socket.data.playerId   = playerId

        // ── Identity Resolution ──────────────────────────────────────────────────
        // Priority 1 — match by stable playerId (most reliable, survives reconnects)
        const isHostById  = (playerId === game.playerWhite?.playerId);
        const isGuestById = !!(room.guestName && playerId === game.playerBlack?.playerId);

        // Priority 2 — name-based fallback, but ONLY for genuine reconnects:
        //   • isHostByName:  name matches hostName  AND game is NOT 'waiting'
        //                    (if still waiting, this could be a new player not the old host)
        //                    AND this socket is NOT already the stored hostSocketId
        //                    (different socket = reconnect scenario)
        const isHostByName = !isHostById
                          && !isGuestById
                          && (playerName === room.hostName)
                          && (room.status !== 'waiting')       // game must have started
                          && (socket.id !== room.hostSocketId); // must be a new socket (reconnect)

        // isGuestByName: name matches guestName, guestName exists, and it's NOT the same as hostName
        const isGuestByName = !isHostById
                           && !isGuestById
                           && !!(room.guestName)
                           && (playerName === room.guestName)
                           && (playerName !== room.hostName)   // prevent cross-match on same name
                           && (room.status !== 'waiting');

        const isHost  = isHostById  || isHostByName;
        const isGuest = isGuestById || isGuestByName;

        if (isHost) {
          // Host reconnecting/refreshing
          socket.data.playerName = game.playerWhite.name;
          socket.data.color      = 'white';

          // Cancel disconnect timeout if rejoining
          const timeoutKey = gameId + '_' + game.playerWhite.playerId;
          if (disconnectTimeouts.has(timeoutKey)) {
            clearTimeout(disconnectTimeouts.get(timeoutKey));
            disconnectTimeouts.delete(timeoutKey);
            await sendSystemMessage(gameId, `${game.playerWhite.name} reconnected.`)
            io.to(gameId).emit('player:reconnected', { playerName: game.playerWhite.name })
          }

          // Update socket ID and status in game & room
          game.playerWhite.socketId = socket.id;
          if (!game.connectedPlayers.includes(playerId)) {
            game.connectedPlayers.push(playerId);
          }
          await game.save();

          room.hostSocketId = socket.id;
          room.gameState = gameState(game);
          await room.save();

          socket.emit('room:joined', { gameId, color: 'white', game: gameState(game) })

          // Sync state on reconnect
          io.to(gameId).emit('playerJoined', {
            game: gameState(game),
            playerWhite: game.playerWhite,
            playerBlack: game.playerBlack,
          })

          if (game.status === 'active') {
            startTimer(gameId);
          }

          console.log(`[${ts()}] MATCH RESTORED [${roomId}] [${game.playerWhite.name}]`)
        } else if (isGuest) {
          // Guest reconnecting/refreshing
          socket.data.playerName = game.playerBlack.name;
          socket.data.color      = 'black';

          // Cancel disconnect timeout if rejoining
          const timeoutKey = gameId + '_' + game.playerBlack.playerId;
          if (disconnectTimeouts.has(timeoutKey)) {
            clearTimeout(disconnectTimeouts.get(timeoutKey));
            disconnectTimeouts.delete(timeoutKey);
            await sendSystemMessage(gameId, `${game.playerBlack.name} reconnected.`)
            io.to(gameId).emit('player:reconnected', { playerName: game.playerBlack.name })
          }

          // Update socket ID and status in game & room
          game.playerBlack.socketId = socket.id;
          if (!game.connectedPlayers.includes(playerId)) {
            game.connectedPlayers.push(playerId);
          }
          await game.save();

          room.guestSocketId = socket.id;
          room.gameState = gameState(game);
          await room.save();

          socket.emit('room:joined', { gameId, color: 'black', game: gameState(game) })

          // Sync state on reconnect
          io.to(gameId).emit('playerJoined', {
            game: gameState(game),
            playerWhite: game.playerWhite,
            playerBlack: game.playerBlack,
          })

          if (game.status === 'active') {
            startTimer(gameId);
          }

          console.log(`[${ts()}] MATCH RESTORED [${roomId}] [${game.playerBlack.name}]`)
        } else if (room.status === 'waiting') {
          // Guest joining for the first time
          let resolvedGuestName = playerName;
          // Identity Separation collision fix
          if (resolvedGuestName === room.hostName) {
            resolvedGuestName = `${playerName} (Guest)`;
          }

          socket.data.playerName = resolvedGuestName;
          socket.data.color      = 'black';

          const guestPlayerObj = {
            playerId,
            socketId: socket.id,
            name: resolvedGuestName,
            rating: rating || 1200,
            avatar: avatar || 'avatar-computer.png'
          };

          game.playerBlack = guestPlayerObj;
          game.status = 'active';
          game.startedAt = new Date();
          if (!game.connectedPlayers.includes(playerId)) {
            game.connectedPlayers.push(playerId);
          }
          await game.save();

          room.guestName    = resolvedGuestName;
          room.guestSocketId = socket.id;
          room.status       = 'active';
          room.gameState    = gameState(game);
          // Extend TTL so an active game room isn't deleted mid-match
          room.expiresAt    = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await room.save();

          socket.emit('room:joined', { gameId, color: 'black', game: gameState(game) })

          // Emit game:started to the HOST (white player) so they transition from waiting → active
          io.to(gameId).emit('game:started', gameState(game))

          // Emit playerJoined event to both clients to update player cards immediately
          io.to(gameId).emit('playerJoined', {
            game: gameState(game),
            playerWhite: game.playerWhite,
            playerBlack: game.playerBlack,
          })

          await sendSystemMessage(gameId, `${resolvedGuestName} joined the match.`)
          await sendSystemMessage(gameId, `Match started.`)
          startTimer(gameId)

          console.log(`[${ts()}] PLAYER JOINED [${resolvedGuestName}] [black] [${roomId}]`)
          console.log(`[${ts()}] ROOM READY [${roomId}]`)
        } else {
          // Spectator
          socket.data.playerName = playerName;
          socket.data.color      = 'spectator';
          socket.emit('room:joined', { gameId, color: 'spectator', game: gameState(game) })
        }

        // Send chat history
        const msgs = await ChatMessage.find({ gameId }).sort({ createdAt: 1 }).limit(100)
        socket.emit('chat:history', msgs)
      }

      // Mark player online
      await User.findOneAndUpdate(
        { username: playerName },
        { isOnline: true, lastSeen: new Date() },
        { upsert: true }
      )
      io.to(game.gameId).emit('player:online', { playerName, online: true })
    } catch (err) {
      console.error('room:join error', err)
      socket.emit('error', { message: 'Failed to join room' })
    }
  })

  // ── Make Move ─────────────────────────────────────────────
  socket.on('game:move', async ({ gameId, move, fen, pgn, san, captured, capturedBy }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game || game.status !== 'active') return

      if (game.fen === fen) return

      game.moves.push({
        san, from: move.from, to: move.to,
        piece: move.piece, color: move.color,
        captured, promotion: move.promotion,
      })
      game.undoneMoves = []
      game.fen        = fen
      game.pgn        = pgn
      game.lastMoveAt = new Date()

      if (captured) {
        if (capturedBy === 'white') game.capturedByWhite.push(captured)
        else                        game.capturedByBlack.push(captured)
      }

      await game.save()

      // Synchronize changes to Room
      await Room.findOneAndUpdate(
        { roomId: game.roomId },
        {
          gameState: gameState(game),
          moveHistory: game.moves
        }
      )

      io.to(gameId).emit('game:move', {
        move, san, fen, pgn,
        captured, capturedBy,
        capturedByWhite: game.capturedByWhite,
        capturedByBlack: game.capturedByBlack,
        moveCount: game.moves.length,
      })
    } catch (err) {
      console.error('game:move error', err)
    }
  })

  // ── Game Over (from client chess.js detection) ────────────
  socket.on('game:over', async ({ gameId, winner, reason }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game || game.status === 'ended') return
      await endGame(game, winner, reason)
    } catch (err) {
      console.error('game:over error', err)
    }
  })

  // ── Resign ───────────────────────────────────────────────
  socket.on('game:resign', async ({ gameId }) => {
    try {
      const game  = await ActiveGame.findOne({ gameId })
      if (!game || game.status === 'ended') return
      const color  = socket.data.color
      const winner = color === 'white' ? 'black' : 'white'
      await endGame(game, winner, 'resignation')
    } catch (err) {
      console.error('game:resign error', err)
    }
  })

  // ── Undo Request ─────────────────────────────────────────
  socket.on('undo:request', async ({ gameId }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game || game.status !== 'active') return
      game.undoRequestedBy = socket.data.playerName
      await game.save()
      
      await sendSystemMessage(gameId, `${socket.data.playerName} requested an Undo.`)
      socket.to(gameId).emit('undo:request', { from: socket.data.playerName })
    } catch (err) {
      console.error('undo:request error', err)
    }
  })

  socket.on('undo:response', async ({ gameId, accepted }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return

      game.undoRequestedBy = null
      await game.save()

      if (!accepted) {
        await sendSystemMessage(gameId, `Undo request rejected.`)
        io.to(gameId).emit('undo:rejected')
        return
      }

      if (game.moves.length < 1) return
      const popped = game.moves.pop()
      if (popped) {
        game.undoneMoves.push(popped)
      }
      recalculateGameState(game)
      await game.save()

      await sendSystemMessage(gameId, `Undo request accepted.`)
      io.to(gameId).emit('undo:accepted', {
        moveCount: game.moves.length,
        pgn: game.pgn,
        fen: game.fen,
        moves: game.moves,
      })
    } catch (err) {
      console.error('undo error', err)
    }
  })

  // ── Redo Request ─────────────────────────────────────────
  socket.on('redo:request', async ({ gameId }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game || game.status !== 'active') return
      game.redoRequestedBy = socket.data.playerName
      await game.save()

      await sendSystemMessage(gameId, `${socket.data.playerName} requested a Redo.`)
      socket.to(gameId).emit('redo:request', { from: socket.data.playerName })
    } catch (err) {
      console.error('redo:request error', err)
    }
  })

  socket.on('redo:response', async ({ gameId, accepted }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return

      game.redoRequestedBy = null
      await game.save()

      if (!accepted) {
        await sendSystemMessage(gameId, `Redo request rejected.`)
        io.to(gameId).emit('redo:rejected')
        return
      }

      if (game.undoneMoves.length < 1) return
      const redone = game.undoneMoves.pop()
      if (redone) {
        game.moves.push(redone)
      }
      recalculateGameState(game)
      await game.save()

      await sendSystemMessage(gameId, `Redo request accepted.`)
      io.to(gameId).emit('redo:accepted', {
        moveCount: game.moves.length,
        pgn: game.pgn,
        fen: game.fen,
        moves: game.moves,
      })
    } catch (err) {
      console.error('redo error', err)
    }
  })

  // ── Reset Request ────────────────────────────────────────
  socket.on('reset:request', async ({ gameId }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game || game.status !== 'active') return
      game.resetRequestedBy = socket.data.playerName
      await game.save()

      await sendSystemMessage(gameId, `${socket.data.playerName} requested a board reset.`)
      socket.to(gameId).emit('reset:request', { from: socket.data.playerName })
    } catch (err) {
      console.error('reset:request error', err)
    }
  })

  socket.on('reset:response', async ({ gameId, accepted }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return

      game.resetRequestedBy = null
      await game.save()

      if (!accepted) {
        await sendSystemMessage(gameId, `Board reset request rejected.`)
        io.to(gameId).emit('reset:rejected')
        return
      }

      // Reset game parameters
      game.moves = []
      game.undoneMoves = []
      game.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      game.pgn = ''
      game.capturedByWhite = []
      game.capturedByBlack = []
      game.timerWhite = 10 * 60
      game.timerBlack = 10 * 60
      await game.save()

      await sendSystemMessage(gameId, `Board reset request accepted.`)
      io.to(gameId).emit('reset:accepted')
    } catch (err) {
      console.error('reset error', err)
    }
  })

  // ── Rematch Request ──────────────────────────────────────
  socket.on('rematch:request', async ({ gameId }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return
      game.rematchRequestedBy = socket.data.playerName
      await game.save()

      await sendSystemMessage(gameId, `${socket.data.playerName} requested a rematch.`)
      socket.to(gameId).emit('rematch:request', { from: socket.data.playerName })
    } catch (err) {
      console.error('rematch:request error', err)
    }
  })

  socket.on('rematch:response', async ({ gameId, accepted }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return

      game.rematchRequestedBy = null
      await game.save()

      if (!accepted) {
        await sendSystemMessage(gameId, `Rematch request rejected.`)
        io.to(gameId).emit('rematch:rejected')
        return
      }

      // Start new match: clear active fields
      game.moves = []
      game.undoneMoves = []
      game.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      game.pgn = ''
      game.capturedByWhite = []
      game.capturedByBlack = []
      game.timerWhite = 10 * 60
      game.timerBlack = 10 * 60
      game.status = 'active'
      game.startedAt = new Date()
      await game.save()

      await sendSystemMessage(gameId, `Rematch started.`)
      io.to(gameId).emit('rematch:accepted', { game: gameState(game) })
      startTimer(gameId)
    } catch (err) {
      console.error('rematch response error', err)
    }
  })

  // ── Close Match ──────────────────────────────────────────
  socket.on('match:close', async ({ gameId }) => {
    try {
      const game = await ActiveGame.findOne({ gameId })
      if (game) {
        const playerId = socket.data.playerId;
        const room = await Room.findOne({ roomId: game.roomId });
        if (room) {
          if (!room.closedBy) room.closedBy = [];
          if (playerId && !room.closedBy.includes(playerId)) {
            room.closedBy.push(playerId);
          }
          await room.save();
          
          // Delete only when both players have closed/left the match
          const numPlayers = room.guestName ? 2 : 1;
          if (room.closedBy.length >= numPlayers) {
            await Room.deleteOne({ roomId: game.roomId })
            await ActiveGame.deleteOne({ gameId })
            console.log(`[${new Date().toISOString()}] Game ${gameId} and Room ${game.roomId} explicitly closed and deleted for both players.`)
          } else {
            console.log(`🧹 Game ${gameId} closed by one player: ${socket.data.playerName || playerId}. Waiting for opponent.`)
          }
        } else {
          // Fallback if room already deleted or not found
          await ActiveGame.deleteOne({ gameId })
        }
      }
      io.to(gameId).emit('match:closed')
    } catch (err) {
      console.error('match:close error', err)
    }
  })

  // ── Chat ─────────────────────────────────────────────────
  socket.on('chat:send', async ({ gameId, message }) => {
    if (isSpam(socket.id)) {
      socket.emit('chat:error', { message: 'Slow down! Too many messages.' }); return
    }
    try {
      const senderId = socket.data.playerId || socket.id
      const senderName = socket.data.playerName || 'Guest'
      const timestamp = Date.now()
      const doc = await ChatMessage.create({
        gameId,
        sender: senderName,
        message: message,
        senderId,
        senderName,
        content: message,
        timestamp,
        type: 'text'
      })
      
      const game = await ActiveGame.findOne({ gameId })
      if (game) {
        await Room.findOneAndUpdate(
          { roomId: game.roomId },
          { $push: { chatMessages: doc } }
        )
      }

      io.to(gameId).emit('chat:message', {
        _id: doc._id,
        gameId,
        sender: senderName,
        message: message,
        senderId,
        senderName,
        content: message,
        timestamp,
        type: 'text',
        createdAt: doc.createdAt,
      })
    } catch (err) {
      console.error('chat:send error', err)
    }
  })

  // ── Emoji ────────────────────────────────────────────────
  socket.on('emoji:send', async ({ gameId, sender, emoji }) => {
    if (isSpam(socket.id)) return
    try {
      await ChatMessage.create({ gameId, sender, message: emoji, type: 'emoji' })
      io.to(gameId).emit('emoji:receive', { sender, emoji, timestamp: Date.now() })
    } catch (err) {
      console.error('emoji:send error', err)
    }
  })

  // ── Board flip request (spectator/player) ───────────────
  socket.on('board:flip', ({ gameId }) => {
    socket.to(gameId).emit('board:flip')
  })

  // ── Player profile update ───────────────────────────────
  socket.on('player:update-profile', async ({ name, avatar }) => {
    try {
      const { gameId, color } = socket.data
      if (!gameId) return
      const game = await ActiveGame.findOne({ gameId })
      if (!game) return

      socket.data.playerName = name

      if (color === 'white') {
        game.playerWhite.name = name
        game.playerWhite.avatar = avatar
      } else {
        game.playerBlack.name = name
        game.playerBlack.avatar = avatar
      }
      await game.save()

      // Emit playerJoined event to both clients to update player cards immediately
      io.to(gameId).emit('playerJoined', {
        game: gameState(game),
        playerWhite: game.playerWhite,
        playerBlack: game.playerBlack,
      })
    } catch (err) {
      console.error('player:update-profile error', err)
    }
  })

  // ── Disconnect ───────────────────────────────────────────
  socket.on('disconnect', async () => {
    const { gameId, playerId, playerName } = socket.data
    const ts = () => new Date().toISOString();
    console.log(`[${ts()}] SOCKET DISCONNECTED [${socket.id}]`)
    if (!gameId || !playerId) return
    try {
      const game = await ActiveGame.findOneAndUpdate(
        { gameId },
        { $pull: { connectedPlayers: playerId } },
        { new: true }
      )
      if (game) {
        
        if (playerName) {
          await sendSystemMessage(gameId, `${playerName} disconnected.`)
        }

        if (game.connectedPlayers.length === 0) {
          stopTimer(gameId)
          console.log(`🔌 Both players disconnected from Game ${gameId}. Timer stopped.`)
        } else if (game.status === 'active') {
          stopTimer(gameId)
          
          // Opponent disconnect handling: wait 5 minutes (300,000 ms)
          const timeoutKey = gameId + '_' + playerId
          
          // Emit opponent disconnected event
          if (playerName) {
            io.to(gameId).emit('opponent:disconnected', { playerName })
          }
          
          const timeoutRef = setTimeout(async () => {
            try {
              const checkGame = await ActiveGame.findOne({ gameId })
              if (checkGame && !checkGame.connectedPlayers.includes(playerId)) {
                // Determine winner
                const winner = checkGame.playerWhite?.playerId === playerId ? 'black' : 'white'
                await endGame(checkGame, winner, 'resignation')
                console.log(`🧹 Game ${gameId} ended after 5 minutes disconnect timeout.`)
              }
            } catch (cleanupErr) {
              console.error('Disconnect cleanup error:', cleanupErr)
            }
          }, 300000)
          
          disconnectTimeouts.set(timeoutKey, timeoutRef)
        }
      }
      if (playerName) {
        await User.findOneAndUpdate({ username: playerName }, { isOnline: false, lastSeen: new Date() })
        io.to(gameId).emit('player:online', { playerName, online: false })
      }
    } catch (err) {
      console.error('disconnect error', err)
    }
    chatTimestamps.delete(socket.id)
  })
})

// ── Helper: clean game state for client ──────────────────────
function gameState(g) {
  return {
    gameId:          g.gameId,
    roomId:          g.roomId,
    playerWhite:     g.playerWhite,
    playerBlack:     g.playerBlack,
    fen:             g.fen,
    pgn:             g.pgn,
    moves:           g.moves,
    undoneMoves:     g.undoneMoves || [],
    capturedByWhite: g.capturedByWhite,
    capturedByBlack: g.capturedByBlack,
    timerWhite:      g.timerWhite,
    timerBlack:      g.timerBlack,
    status:          g.status,
    startedAt:       g.startedAt,
  }
}

// ── REST API ─────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date() }))

app.post('/api/player/edit', async (req, res) => {
  const { oldUsername, newUsername, avatar } = req.body
  if (!newUsername || !newUsername.trim()) return res.status(400).json({ error: 'Username is required' })
  try {
    let user = await User.findOne({ username: oldUsername })
    if (user) {
      if (oldUsername !== newUsername) {
        const existing = await User.findOne({ username: newUsername })
        if (existing) return res.status(409).json({ error: 'Username already taken' })
        user.username = newUsername
      }
      if (avatar) {
        user.avatar = avatar
      }
      await user.save()
    } else {
      user = await User.create({ username: newUsername, avatar: avatar || 'avatar-arjun.png' })
    }
    res.json({ username: user.username, rating: user.rating, avatar: user.avatar })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/game/:gameId', async (req, res) => {
  try {
    const g = await ActiveGame.findOne({ gameId: req.params.gameId })
    if (!g) return res.status(404).json({ error: 'Not found' })
    res.json(gameState(g))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/game/save', async (req, res) => {
  const {
    gameId,
    roomId,
    playerWhite,
    playerBlack,
    fen,
    pgn,
    moves,
    capturedByWhite,
    capturedByBlack,
    timerWhite,
    timerBlack,
    status,
    startedAt,
  } = req.body
  try {
    let game = await ActiveGame.findOne({ gameId })
    if (!game) {
      game = new ActiveGame({ gameId, roomId })
    }
    game.playerWhite = playerWhite
    game.playerBlack = playerBlack
    game.fen = fen
    game.pgn = pgn
    game.moves = moves
    game.capturedByWhite = capturedByWhite || []
    game.capturedByBlack = capturedByBlack || []
    game.timerWhite = timerWhite
    game.timerBlack = timerBlack
    game.status = status
    game.startedAt = startedAt
    game.lastMoveAt = new Date()
    await game.save()
    res.json({ success: true, game: gameState(game) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params
    stopTimer(gameId)
    await ActiveGame.deleteOne({ gameId })
    io.to(gameId).emit('match:closed')
    res.json({ success: true, message: 'Game deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


app.get('/api/players', async (_req, res) => {
  try {
    const players = await User.find().sort({ rating: -1 }).limit(20)
    res.json(players)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/player/:username', async (req, res) => {
  try {
    const p = await User.findOne({ username: req.params.username })
    if (!p) return res.status(404).json({ error: 'Not found' })
    res.json(p)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Start ────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`🚀 LEO Chess server on http://localhost:${PORT}`)
})
