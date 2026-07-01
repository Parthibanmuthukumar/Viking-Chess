import ChessPieceShowcase from './ChessPieceShowcase';
import { PieceType, MetalColor } from './ChessPieceShowcase';

const FILE_POSITIONS = Array.from({ length: 8 }, (_, index) => -1.925 + index * 0.55)
const MAJOR_ORDER: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook']

type WhitePiecesProps = {
  metalColor: MetalColor
  roughness: number
  selectedId: string
  onSelect: (id: string, type: PieceType, color: 'white') => void
}

export default function WhitePiecesShowcase({
  metalColor,
  roughness,
  selectedId,
  onSelect,
}: WhitePiecesProps) {
  return (
    <group>
      {MAJOR_ORDER.map((type, index) => {
        const id = `white-${type}-${index}`
        return (
          <ChessPieceShowcase
            key={id}
            type={type}
            color="white"
            metalColor={metalColor}
            roughness={roughness}
            position={[FILE_POSITIONS[index], -0.72, 1.925]}
            scale={0.44}
            isSelected={selectedId === id}
            onClick={() => onSelect(id, type, 'white')}
          />
        )
      })}
      {FILE_POSITIONS.map((x, index) => {
        const id = `white-pawn-${index}`
        return (
          <ChessPieceShowcase
            key={id}
            type="pawn"
            color="white"
            metalColor={metalColor}
            roughness={roughness}
            position={[x, -0.72, 1.375]}
            scale={0.44}
            isSelected={selectedId === id}
            onClick={() => onSelect(id, 'pawn', 'white')}
          />
        )
      })}
    </group>
  )
}
