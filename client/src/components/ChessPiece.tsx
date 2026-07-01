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

export default function ChessPiece({
  type,
  color,
  metalColor,
  roughness,
  position,
  scale = 0.24,
  isSelected = false,
  onClick,
}: ChessPieceProps) {
  const bodyColor = color === 'white' ? '#fcfbf9' : '#18181b'
  const emissive = color === 'white' ? '#0f0e0c' : '#030303'
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
    depth: 0.24,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.02,
    bevelThickness: 0.02,
  }), [])

  const bishopPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.38, 0.10),
      new THREE.Vector2(0.34, 0.18),
      new THREE.Vector2(0.28, 0.28), // flared base
      new THREE.Vector2(0.18, 0.55), // thin waist
      new THREE.Vector2(0.15, 0.82), // waist neck
      new THREE.Vector2(0.22, 0.86), // collar ring
      new THREE.Vector2(0.22, 0.90), // collar ring top
      new THREE.Vector2(0.15, 0.94), // head base
      new THREE.Vector2(0.24, 1.08), // fat head oval
      new THREE.Vector2(0.12, 1.25), // pointed head top
      new THREE.Vector2(0.0, 1.28),
    ],
    [],
  )

  const queenPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.40, 0.10),
      new THREE.Vector2(0.36, 0.18),
      new THREE.Vector2(0.28, 0.32), // waist start
      new THREE.Vector2(0.18, 0.65), // waist center
      new THREE.Vector2(0.15, 0.95), // narrow neck
      new THREE.Vector2(0.25, 1.00), // neck collar ring
      new THREE.Vector2(0.25, 1.04), // neck collar ring top
      new THREE.Vector2(0.16, 1.08), // crown base
      new THREE.Vector2(0.34, 1.35), // flared crown cup rim
      new THREE.Vector2(0.35, 1.40), // crown cup lip
      new THREE.Vector2(0.0, 1.40),
    ],
    [],
  )

  const kingPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.10),
      new THREE.Vector2(0.42, 0.10),
      new THREE.Vector2(0.38, 0.18),
      new THREE.Vector2(0.30, 0.32), // waist start
      new THREE.Vector2(0.21, 0.68), // waist center
      new THREE.Vector2(0.16, 1.02), // neck
      new THREE.Vector2(0.26, 1.08), // collar ring
      new THREE.Vector2(0.26, 1.12), // collar ring top
      new THREE.Vector2(0.18, 1.16), // head base
      new THREE.Vector2(0.28, 1.34), // crown/cap flare
      new THREE.Vector2(0.25, 1.48), // cap top dome
      new THREE.Vector2(0.0, 1.48),
    ],
    [],
  )

  const glossy = color === 'white' ? {
    metalness: 0.05,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.01,
    envMapIntensity: 2.8,
    reflectivity: 1.0,
  } : {
    metalness: 0.85,
    roughness: 0.10,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 2.8,
    reflectivity: 1.0,
  }

  const handlePointerDown = (e: any) => {
    e.stopPropagation()
    if (onClick) onClick()
  }

  const renderPieceMeshes = (isOutline: boolean) => {
    const mat = isOutline ? (
      <meshBasicMaterial color="#202024" side={THREE.BackSide} />
    ) : (
      <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
    );

    const goldMat = isOutline ? (
      <meshBasicMaterial color="#202024" side={THREE.BackSide} />
    ) : (
      <meshPhysicalMaterial
        color="#d4af37"
        roughness={0.08}
        metalness={0.98}
        clearcoat={1.0}
        clearcoatRoughness={0.04}
        envMapIntensity={2.8}
      />
    );

    return (
      <>
        {/* Base ring (gold base ring as in design image) */}
        <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
          <latheGeometry args={[basePts, 96]} />
          {goldMat}
        </mesh>

        {/* Specific piece body & accessories */}
        {type === 'pawn' && (
          <>
            <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
              <latheGeometry args={[pawnPts, 96]} />
              {mat}
            </mesh>
            <mesh position={[0, 0.88, 0]} castShadow={!isOutline}>
              <sphereGeometry args={[0.18, 32, 32]} />
              {mat}
            </mesh>
            {/* Gold Collar Ring */}
            <mesh position={[0, 0.69, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.16, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}

        {type === 'rook' && (
          <>
            <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
              <latheGeometry args={[rookPts, 96]} />
              {mat}
            </mesh>
            {/* Rook castle notch details (gold battlements) */}
            <group position={[0, 1.03, 0]}>
              {Array.from({ length: 4 }).map((_, i) => {
                const angle = (i * Math.PI) / 2
                const x = Math.cos(angle) * 0.28
                const z = Math.sin(angle) * 0.28
                return (
                  <mesh key={i} position={[x, 0, z]} rotation={[0, -angle, 0]} castShadow={!isOutline}>
                    <boxGeometry args={[0.10, 0.10, 0.12]} />
                    {goldMat}
                  </mesh>
                )
              })}
            </group>
            {/* Gold Collar Ring */}
            <mesh position={[0, 0.76, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.24, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}

        {type === 'knight' && (
          <>
            <group position={[0, 0, -0.12]}>
              <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
                <extrudeGeometry args={[knightShape, knightExtrudeSettings]} />
                {mat}
              </mesh>
            </group>
            {/* Gold Collar Ring */}
            <mesh position={[0, 0.22, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.22, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}

        {type === 'bishop' && (
          <>
            <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
              <latheGeometry args={[bishopPts, 96]} />
              {mat}
            </mesh>
            <mesh position={[0, 1.34, 0]} castShadow={!isOutline}>
              <sphereGeometry args={[0.06, 24, 24]} />
              {goldMat}
            </mesh>
            {/* Gold Collar Ring */}
            <mesh position={[0, 0.88, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.19, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}

        {type === 'queen' && (
          <>
            <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
              <latheGeometry args={[queenPts, 96]} />
              {mat}
            </mesh>
            <mesh position={[0, 1.45, 0]} castShadow={!isOutline}>
              <sphereGeometry args={[0.08, 24, 24]} />
              {goldMat}
            </mesh>
            {/* Gold Collar Ring */}
            <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.22, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}

        {type === 'king' && (
          <>
            <mesh castShadow={!isOutline} receiveShadow={!isOutline}>
              <latheGeometry args={[kingPts, 96]} />
              {mat}
            </mesh>
            <mesh position={[0, 1.52, 0]} castShadow={!isOutline}>
              <cylinderGeometry args={[0.14, 0.14, 0.08, 32]} />
              {goldMat}
            </mesh>
            {/* King's top cross */}
            <mesh position={[0, 1.66, 0]} castShadow={!isOutline}>
              <boxGeometry args={[0.06, 0.26, 0.06]} />
              {goldMat}
            </mesh>
            <mesh position={[0, 1.72, 0]} castShadow={!isOutline}>
              <boxGeometry args={[0.20, 0.06, 0.06]} />
              {goldMat}
            </mesh>
            {/* Gold Collar Ring */}
            <mesh position={[0, 1.10, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow={!isOutline}>
              <torusGeometry args={[0.23, 0.025, 8, 24]} />
              {goldMat}
            </mesh>
          </>
        )}
      </>
    );
  };

  return (
    <group position={position} scale={[scale, scale, scale]} onPointerDown={handlePointerDown}>
      {/* 1. Selection Glow Ring */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.44, 0.50, 32]} />
          <meshBasicMaterial color="#c9a84c" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Render main piece */}
      {renderPieceMeshes(false)}

      {color === 'white' && (
        <group scale={[1.025, 1.025, 1.025]} position={[0, -0.001, 0]}>
          {renderPieceMeshes(true)}
        </group>
      )}
    </group>
  )
}
