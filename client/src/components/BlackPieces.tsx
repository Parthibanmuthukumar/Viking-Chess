import ChessPiece, { MetalColor, PieceType } from './ChessPiece';

const FILE_POSITIONS = Array.from({ length: 8 }, (_, index) => -1.925 + index * 0.55)
const MAJOR_ORDER: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

type BlackPiecesProps = {
  metalColor: MetalColor
  roughness: number
  selectedId: string
  onSelect: (id: string, type: PieceType, color: 'black') => void
}

export default function BlackPieces({
  metalColor,
  roughness,
  selectedId,
  onSelect,
}: BlackPiecesProps) {
  return (
    <group>
      {MAJOR_ORDER.map((type, index) => {
        const id = `black-${type}-${index}`
        return (
          <ChessPiece
            key={id}
            type={type}
            color="black"
            metalColor={metalColor}
            roughness={roughness}
            position={[FILE_POSITIONS[index], -0.696, -1.925]}
            isSelected={selectedId === id}
            onClick={() => onSelect(id, type, 'black')}
          />
        )
      })}
      {FILE_POSITIONS.map((x, index) => {
        const id = `black-pawn-${index}`
        return (
          <ChessPiece
            key={id}
            type="pawn"
            color="black"
            metalColor={metalColor}
            roughness={roughness}
            position={[x, -0.696, -1.375]}
            isSelected={selectedId === id}
            onClick={() => onSelect(id, 'pawn', 'black')}
          />
        )
      })}
    </group>
  )
}
