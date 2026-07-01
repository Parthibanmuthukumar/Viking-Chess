import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

type PieceColor = 'white' | 'black'
type MetalColor = 'chrome' | 'gold' | 'rosegold' | 'gunmetal'


type KingPieceProps = {
  color: PieceColor
  metalColor: MetalColor
  roughness: number
  autoRotate: boolean
  position?: [number, number, number]
  scale?: number
}

export default function KingPiece({
  color,
  metalColor,
  roughness,
  autoRotate,
  position = [0, -0.72, 0],
  scale = 1,
}: KingPieceProps) {
  const groupRef = useRef<THREE.Group>(null)

  const bodyColor = color === 'white' ? '#dedbd4' : '#1c1c1e'
  const emissive = color === 'white' ? '#0a0a0a' : '#050505'

  const metalMap: Record<MetalColor, string> = {
    chrome: '#c2c2cc',
    gold: '#d4af37',
    rosegold: '#b76e79',
    gunmetal: '#3c3f42',
  }

  const metalHex = metalMap[metalColor]

  const bodyPts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.38, 0.0),
      new THREE.Vector2(0.41, 0.05),
      new THREE.Vector2(0.39, 0.11),
      new THREE.Vector2(0.34, 0.22),
      new THREE.Vector2(0.28, 0.35),
      new THREE.Vector2(0.21, 0.52),
      new THREE.Vector2(0.15, 0.68),
      new THREE.Vector2(0.1, 0.83),
      new THREE.Vector2(0.08, 0.94),
      new THREE.Vector2(0.09, 1.02),
      new THREE.Vector2(0.13, 1.1),
      new THREE.Vector2(0.19, 1.19),
      new THREE.Vector2(0.22, 1.27),
      new THREE.Vector2(0.23, 1.33),
      new THREE.Vector2(0.19, 1.37),
      new THREE.Vector2(0.14, 1.39),
      new THREE.Vector2(0.0, 1.39),
    ],
    [],
  )

  const basePts = useMemo(
    () => [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.41, 0.0),
      new THREE.Vector2(0.41, 0.06),
      new THREE.Vector2(0.39, 0.11),
      new THREE.Vector2(0.0, 0.11),
    ],
    [],
  )

  useFrame((_state, delta) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y += delta * 0.42
    }
  })

  const glossy = {
    metalness: 0.0,
    roughness,
    clearcoat: 1.0,
    clearcoatRoughness: roughness * 0.35,
    envMapIntensity: 2.2,
    reflectivity: 0.95,
  }

  return (
    <group ref={groupRef} position={position} scale={[scale, scale, scale]}>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[basePts, 96]} />
        <meshPhysicalMaterial
          color={metalHex}
          metalness={0.96}
          roughness={0.06}
          envMapIntensity={2.5}
          reflectivity={1}
        />
      </mesh>

      <mesh castShadow receiveShadow>
        <latheGeometry args={[bodyPts, 96]} />
        <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
      </mesh>

      <mesh position={[0, 1.39, 0]} castShadow>
        <cylinderGeometry args={[0.075, 0.135, 0.13, 40]} />
        <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
      </mesh>

      <mesh position={[0, 1.55, 0]} castShadow>
        <boxGeometry args={[0.058, 0.3, 0.058]} />
        <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
      </mesh>

      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[0.23, 0.058, 0.058]} />
        <meshPhysicalMaterial color={bodyColor} emissive={emissive} {...glossy} />
      </mesh>
    </group>
  )
}
