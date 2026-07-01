import { useMemo } from 'react';
import * as THREE from 'three';

export type PieceColor = 'white' | 'black'
export type MetalColor = 'chrome' | 'gold' | 'rosegold' | 'gunmetal'
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king'

type ChessPieceProps = {
  type: PieceType
  color: PieceColor
  metalColor: MetalColor
  roughness: number
  position: [number, number, number]
  scale?: number
  isSelected?: boolean
  onClick?: () => void
}

const metalMap: Record<MetalColor, string> = {
  chrome: '#c8cbd4',
  gold: '#d4af37',
  rosegold: '#b76e79',
  gunmetal: '#3c3f42',
}

export default function ChessPieceShowcase({
  type,
  color,
  metalColor,
  roughness,
  position,
  scale = 0.44,
  isSelected = false,
  onClick,
}: ChessPieceProps) {
  const bodyColor = color === 'white' ? '#faf8f5' : '#141416'
  const emissive = color === 'white' ? '#0f0e0c' : '#050505'
  const metalHex = metalMap[metalColor]

  // Base metal ring points (shared for all pieces)
  const basePts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.42, 0.0),
      new THREE.Vector2(0.42, 0.06),
      new THREE.Vector2(0.38, 0.10),
      new THREE.Vector2(0.0, 0.10),
    ],
    [],
  )

  // 1. Pawn body points
  const pawnPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.35, 0.10),
      new THREE.Vector2(0.32, 0.18),
      new THREE.Vector2(0.24, 0.28),
      new THREE.Vector2(0.16, 0.42),
      new THREE.Vector2(0.12, 0.58),
      new THREE.Vector2(0.14, 0.68),
      new THREE.Vector2(0.20, 0.70),
      new THREE.Vector2(0.0, 0.70),
    ],
    [],
  )

  // 2. Rook body points
  const rookPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.38, 0.10),
      new THREE.Vector2(0.35, 0.18),
      new THREE.Vector2(0.30, 0.32),
      new THREE.Vector2(0.27, 0.70),
      new THREE.Vector2(0.35, 0.82),
      new THREE.Vector2(0.35, 0.98),
      new THREE.Vector2(0.0, 0.98),
    ],
    [],
  )

  // 3. Knight Extruded Profile (Horse head)
  const knightShape = useMemo(() => {
    const s = new THREE.Shape()
    s.moveTo(0.16, 0.10)
    s.quadraticCurveTo(0.23, 0.28, 0.23, 0.48) // back of neck
    s.quadraticCurveTo(0.20, 0.70, 0.10, 0.90) // back of head
    s.lineTo(0.04, 1.06) // ear back
    s.lineTo(-0.01, 1.06) // ear top
    s.lineTo(-0.04, 0.92) // ear front
    s.lineTo(-0.08, 0.92) // head front
    s.quadraticCurveTo(-0.25, 0.78, -0.29, 0.68) // snout top
    s.lineTo(-0.25, 0.56) // nose
    s.lineTo(-0.16, 0.52) // mouth
    s.quadraticCurveTo(-0.10, 0.42, -0.14, 0.28) // jaw/chest
    s.quadraticCurveTo(-0.18, 0.16, -0.16, 0.10) // chest bottom
    s.lineTo(0.16, 0.10)
    return s
  }, [])

  const knightExtrudeSettings = useMemo(() => ({
    depth: 0.14,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  }), [])

  // 4. Bishop body points
  const bishopPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.38, 0.10),
      new THREE.Vector2(0.34, 0.18),
      new THREE.Vector2(0.26, 0.30),
      new THREE.Vector2(0.18, 0.55),
      new THREE.Vector2(0.14, 0.78),
      new THREE.Vector2(0.16, 0.86),
      new THREE.Vector2(0.24, 0.92),
      new THREE.Vector2(0.24, 1.05),
      new THREE.Vector2(0.18, 1.15),
      new THREE.Vector2(0.08, 1.20),
      new THREE.Vector2(0.0, 1.22),
    ],
    [],
  )

  // 5. Queen body points
  const queenPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.40, 0.10),
      new THREE.Vector2(0.36, 0.18),
      new THREE.Vector2(0.28, 0.32),
      new THREE.Vector2(0.18, 0.60),
      new THREE.Vector2(0.14, 0.90),
      new THREE.Vector2(0.16, 1.04),
      new THREE.Vector2(0.26, 1.18),
      new THREE.Vector2(0.30, 1.26),
      new THREE.Vector2(0.0, 1.26),
    ],
    [],
  )

  // 6. King body points
  const kingPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.42, 0.10),
      new THREE.Vector2(0.38, 0.18),
      new THREE.Vector2(0.30, 0.32),
      new THREE.Vector2(0.20, 0.65),
      new THREE.Vector2(0.15, 0.98),
      new THREE.Vector2(0.18, 1.14),
      new THREE.Vector2(0.24, 1.26),
      new THREE.Vector2(0.22, 1.34),
      new THREE.Vector2(0.0, 1.34),
    ],
    [],
  )

  const glossy = {
    metalness: 0.05,
    roughness,
    clearcoat: 1.0,
    clearcoatRoughness: roughness * 0.35,
    envMapIntensity: 2.2,
    reflectivity: 0.95,
  }

  const handlePointerDown = (e: any) => {
    e.stopPropagation()
    if (onClick) onClick()
  }

  return (
    <group position={position} scale={[scale, scale, scale]} onPointerDown={handlePointerDown}>
      {/* 1. Selection Glow Ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.44, 0.50, 32]} />
          <meshBasicMaterial color="#c9a84c" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* 2. Metallic base ring (shared by all) */}
      <mesh castShadow receiveShadow>
        <latheGeometry args={[basePts, 96]} />
        <meshPhysicalMaterial
          color={metalHex}
          metalness={0.98}
          roughness={0.06}
          envMapIntensity={2.5}
          reflectivity={1}
        />
      </mesh>

      {/* 3. Specific piece body & accessories */}
      {type === 'pawn' && (
        <>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[pawnPts, 96]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          <mesh position={[0, 0.88, 0]} castShadow>
            <sphereGeometry args={[0.18, 32, 32]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
        </>
      )}

      {type === 'rook' && (
        <>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[rookPts, 96]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          {/* Rook castle notch details */}
          <group position={[0, 1.03, 0]}>
            {Array.from({ length: 4 }).map((_, i) => {
              const angle = (i * Math.PI) / 2
              const x = Math.cos(angle) * 0.28
              const z = Math.sin(angle) * 0.28
              return (
                <mesh key={i} position={[x, 0, z]} rotation={[0, -angle, 0]} castShadow>
                  <boxGeometry args={[0.10, 0.10, 0.12]} />
                  <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
                </mesh>
              )
            })}
          </group>
        </>
      )}

      {type === 'knight' && (
        <group position={[0, 0, -0.07]}>
          <mesh castShadow receiveShadow>
            <extrudeGeometry args={[knightShape, knightExtrudeSettings]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
        </group>
      )}

      {type === 'bishop' && (
        <>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[bishopPts, 96]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          <mesh position={[0, 1.28, 0]} castShadow>
            <sphereGeometry args={[0.06, 24, 24]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
        </>
      )}

      {type === 'queen' && (
        <>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[queenPts, 96]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          <mesh position={[0, 1.33, 0]} castShadow>
            <sphereGeometry args={[0.07, 24, 24]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
        </>
      )}

      {type === 'king' && (
        <>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[kingPts, 96]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          <mesh position={[0, 1.38, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.12, 0.08, 32]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          {/* King's top cross */}
          <mesh position={[0, 1.52, 0]} castShadow>
            <boxGeometry args={[0.05, 0.24, 0.05]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
          <mesh position={[0, 1.58, 0]} castShadow>
            <boxGeometry args={[0.18, 0.05, 0.05]} />
            <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
          </mesh>
        </>
      )}
    </group>
  )
}
