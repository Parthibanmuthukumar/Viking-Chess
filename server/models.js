import mongoose from 'mongoose'

// ── Chat Message ──────────────────────────────────────────────
const chatMessageSchema = new mongoose.Schema(
  {
    gameId:     { type: String, required: true, index: true },
    sender:     { type: String, required: true },
    message:    { type: String, required: true, maxlength: 500 },
    senderId:   { type: String },
    senderName: { type: String },
    content:    { type: String },
    timestamp:  { type: Number },
    type:       { type: String, enum: ['text', 'emoji', 'system'], default: 'text' },
  },
  { timestamps: true }
)

// ── User ──────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    username:    { type: String, required: true, unique: true, trim: true },
    rating:      { type: Number, default: 1200 },
    avatar:      { type: String, default: 'avatar-arjun.png' },
    wins:        { type: Number, default: 0 },
    losses:      { type: Number, default: 0 },
    draws:       { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    isOnline:    { type: Boolean, default: false },
    lastSeen:    { type: Date, default: Date.now },
  },
  { timestamps: true }
)

// ── Room ──────────────────────────────────────────────────────
const roomSchema = new mongoose.Schema(
  {
    roomId:        { type: String, required: true, unique: true },
    hostSocketId:  { type: String, required: true },
    hostName:      { type: String, required: true },
    guestSocketId: { type: String, default: null },
    guestName:     { type: String, default: null },
    status:        { type: String, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
    createdAt:     { type: Date, default: Date.now },
    gameState:     { type: mongoose.Schema.Types.Mixed, default: null },
    moveHistory:   { type: [mongoose.Schema.Types.Mixed], default: [] },
    chatMessages:  { type: [mongoose.Schema.Types.Mixed], default: [] },
    closedBy:      { type: [String], default: [] },
    // TTL: auto-delete abandoned waiting/ended rooms after 24 hours
    expiresAt:     { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  },
  { timestamps: true }
)
// MongoDB TTL index — document is deleted when current time passes expiresAt
roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// ── Active Game ───────────────────────────────────────────────
const activeGameSchema = new mongoose.Schema(
  {
    gameId:           { type: String, required: true, unique: true, index: true },
    roomId:           { type: String, required: true, index: true },
    playerWhite:      { playerId: String, socketId: String, name: String, rating: Number, avatar: String },
    playerBlack:      { playerId: String, socketId: String, name: String, rating: Number, avatar: String },
    moves:            { type: [mongoose.Schema.Types.Mixed], default: [] },
    undoneMoves:      { type: [mongoose.Schema.Types.Mixed], default: [] },
    fen:              { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    pgn:              { type: String, default: '' },
    capturedByWhite:  { type: [String], default: [] },
    capturedByBlack:  { type: [String], default: [] },
    timerWhite:       { type: Number, default: 10 * 60 },
    timerBlack:       { type: Number, default: 10 * 60 },
    status:           { type: String, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
    startedAt:        { type: Date, default: null },
    lastMoveAt:       { type: Date, default: null },
    connectedPlayers: { type: [String], default: [] },
    undoRequestedBy:  { type: String, default: null },
    redoRequestedBy:  { type: String, default: null },
    resetRequestedBy: { type: String, default: null },
    rematchRequestedBy:{ type: String, default: null },
    // TTL: auto-delete ended games after 7 days
    expiresAt:        { type: Date, default: null },
  },
  { timestamps: true }
)
// MongoDB TTL index — only fires when expiresAt is set (set on endGame)
activeGameSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true })

// ── Match History ─────────────────────────────────────────────
const matchHistorySchema = new mongoose.Schema(
  {
    gameId:      { type: String, required: true },
    roomId:      { type: String, required: true },
    playerWhite: { name: String, rating: Number },
    playerBlack: { name: String, rating: Number },
    winner:      { type: String, enum: ['white', 'black', 'draw'], required: true },
    reason:      { type: String, required: true },
    moves:       { type: Number, default: 0 },
    duration:    { type: Number, default: 0 },
    pgn:         { type: String, default: '' },
    eloChanges:  [
      {
        name:   String,
        before: Number,
        after:  Number,
        delta:  Number,
      }
    ],
  },
  { timestamps: true }
)

// ── ELO History ───────────────────────────────────────────────
const eloHistorySchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true },
    gameId:   { type: String, required: true },
    delta:    { type: Number, required: true },
    after:    { type: Number, required: true },
  },
  { timestamps: true }
)

export const ChatMessage  = mongoose.model('ChatMessage',  chatMessageSchema, 'chatMessages')
export const User         = mongoose.model('User',         userSchema,        'users')
export const Room         = mongoose.model('Room',         roomSchema,        'rooms')
export const ActiveGame   = mongoose.model('ActiveGame',   activeGameSchema,  'activeGames')
export const MatchHistory = mongoose.model('MatchHistory', matchHistorySchema, 'matchHistory')
export const EloHistory   = mongoose.model('EloHistory',   eloHistorySchema,   'eloHistory')
