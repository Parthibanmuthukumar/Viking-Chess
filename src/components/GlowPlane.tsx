import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

type GlowPlaneProps = {
  glowColor: string
}

export default function GlowPlane({ glowColor }: GlowPlaneProps) {
  const ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (ref.current) {
      const material = ref.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.04 + Math.sin(clock.getElapsedTime() * 0.45) * 0.015
    }
  })

  return (
    <mesh ref={ref} position={[0, -0.718, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[2.5, 64]} />
      <meshBasicMaterial color={glowColor} transparent opacity={0.04} depthWrite={false} />
    </mesh>
  )
}
