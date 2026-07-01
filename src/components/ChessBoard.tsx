import { Text } from '@react-three/drei';
import { useMemo } from 'react';

const SQUARE_SIZE = 0.55
const BOARD_SIZE = SQUARE_SIZE * 8
const HALF_BOARD = BOARD_SIZE / 2
const OFFSET = HALF_BOARD - SQUARE_SIZE / 2

const FILE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const RANK_LABELS = ['8', '7', '6', '5', '4', '3', '2', '1'] // Corrected rank order
const LABEL_POSITIONS = Array.from({ length: 8 }, (_, index) => -1.925 + index * 0.55)

export default function ChessBoard() {
  const squares = useMemo(() => {
    const result: Array<{ position: [number, number, number]; isDark: boolean }> = []

    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const isDark = (row + col) % 2 === 0
        result.push({
          position: [col * SQUARE_SIZE - OFFSET, 0.022, row * SQUARE_SIZE - OFFSET],
          isDark,
        })
      }
    }

    return result
  }, [])

  // Material settings for glossy mirror look
  const boardMaterial = {
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 2.2,
  }

  return (
    <group position={[0, -0.72, 0]}>
      {/* 1. Large Outer Base Block (Matte black metal frame) */}
      <mesh position={[0, -0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 0.48, 0.30, BOARD_SIZE + 0.48]} />
        <meshPhysicalMaterial
          color="#0a0a0c"
          roughness={0.4}
          metalness={0.8}
          clearcoat={0.5}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {/* 2. Gunmetal / Dark Chrome Frame Bevel Block (replaces yellow/gold) */}
      <mesh position={[0, -0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 0.40, 0.31, BOARD_SIZE + 0.40]} />
        <meshPhysicalMaterial
          color="#16161a"
          roughness={0.15}
          metalness={0.9}
          clearcoat={1.0}
          clearcoatRoughness={0.06}
        />
      </mesh>

      {/* 3. Inner Table surface substrate (Matte black) */}
      <mesh position={[0, -0.135, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_SIZE + 0.32, 0.28, BOARD_SIZE + 0.32]} />
        <meshPhysicalMaterial
          color="#0d0d0f"
          roughness={0.35}
          metalness={0.25}
          clearcoat={0.6}
        />
      </mesh>

      {/* Grid Squares */}
      {squares.map(({ position, isDark }, index) => {
        // row=0 is z=-1.925 (Rank 8), col=0 is x=-1.925 (Col A)
        // A8 should be light, so isDark=true -> light, isDark=false -> dark
        const color = isDark ? '#f3efe6' : '#1a1a1e'
        return (
          <mesh key={`square-${index}`} position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[SQUARE_SIZE - 0.008, SQUARE_SIZE - 0.008]} />
            <meshPhysicalMaterial color={color} {...boardMaterial} />
          </mesh>
        )
      })}

      {/* Thin Gold Frame bordering the square grid */}
      <mesh position={[0, 0.023, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[HALF_BOARD + 0.005, HALF_BOARD + 0.025, 4, 1, Math.PI / 4]} />
        <meshPhysicalMaterial
          color="#d4af37"
          roughness={0.08}
          metalness={0.98}
          clearcoat={1.0}
        />
      </mesh>

      {/* Column Labels (A-H) */}
      {FILE_LABELS.map((label, index) => {
        const x = LABEL_POSITIONS[index]
        return (
          <group key={`file-${label}`}>
            {/* Bottom label (facing viewer from below) */}
            <Text
              position={[x, 0.025, 2.32]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.115}
              fontWeight={500}
              color="#d4af37"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
            {/* Top label (facing viewer from above) */}
            <Text
              position={[x, 0.025, -2.32]}
              rotation={[-Math.PI / 2, 0, Math.PI]}
              fontSize={0.115}
              fontWeight={500}
              color="#d4af37"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
          </group>
        )
      })}

      {/* Row Labels (1-8) */}
      {RANK_LABELS.map((label, index) => {
        const z = LABEL_POSITIONS[index]
        return (
          <group key={`rank-${label}`}>
            {/* Left label — rotated to face inward (upright for camera) */}
            <Text
              position={[-2.32, 0.025, z]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
              fontSize={0.115}
              fontWeight={500}
              color="#d4af37"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
            {/* Right label — rotated to face inward (upright for camera) */}
            <Text
              position={[2.32, 0.025, z]}
              rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
              fontSize={0.115}
              fontWeight={500}
              color="#d4af37"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
          </group>
        )
      })}
    </group>
  )
}
