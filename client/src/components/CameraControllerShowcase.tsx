import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';

export default function CameraControllerShowcase() {
  const controlsRef = useRef<any>(null)

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom={true}
      enablePan={false}
      enableDamping={true}
      dampingFactor={0.06}
      minDistance={4.5}
      maxDistance={9.5}
      minPolarAngle={Math.PI * 0.20} // Limit top perspective
      maxPolarAngle={Math.PI * 0.44} // Limit side perspective
    />
  )
}
