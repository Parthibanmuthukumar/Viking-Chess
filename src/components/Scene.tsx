import { ContactShadows, Environment } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import React, { Component, ReactNode, Suspense, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import BlackPieces from './BlackPiecesShowcase';
import CameraController from './CameraControllerShowcase';
import ChessBoard from './ChessBoardShowcase';
import GlowPlane from './GlowPlane';
import WhitePieces from './WhitePiecesShowcase';

class EnvironmentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn("Scene Environment failed to load:", error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export type PieceColor = 'white' | 'black'
export type MetalColor = 'chrome' | 'gold' | 'rosegold' | 'gunmetal'
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king'

type SceneProps = {
  pieceColor: PieceColor
  metalColor: MetalColor
  roughness: number
  autoRotate: boolean
  lightIntensity: number
  selectedId: string
  onSelect: (id: string, type: PieceType, color: PieceColor) => void
}

function SceneContent({
  pieceColor,
  metalColor,
  roughness,
  autoRotate,
  lightIntensity,
  selectedId,
  onSelect,
}: SceneProps) {
  const boardGroupRef = useRef<THREE.Group>(null)
  const scrollRef = useRef(0)
  const autoRotateAngleRef = useRef(0)

  // Listen to window scroll to rotate the board
  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      if (maxScroll > 0) {
        scrollRef.current = window.scrollY / maxScroll
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useFrame((_state, delta) => {
    const cappedDelta = Math.min(delta, 0.1);
    if (autoRotate) {
      autoRotateAngleRef.current += cappedDelta * 0.12 // slow auto rotation
    }

    if (boardGroupRef.current) {
      const scrollAngle = scrollRef.current * Math.PI * 2
      const targetAngle = autoRotateAngleRef.current + scrollAngle

      // Lerp Y rotation smoothly
      boardGroupRef.current.rotation.y = THREE.MathUtils.lerp(
        boardGroupRef.current.rotation.y,
        targetAngle,
        0.05
      )
    }
  })

  const [boardScale, setBoardScale] = useState<[number, number, number]>([1, 1, 1]);
  const [boardPosition, setBoardPosition] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 480) {
        setBoardScale([0.55, 0.55, 0.55]);
        setBoardPosition([0, 0.7, 0]);
      } else if (window.innerWidth <= 768) {
        setBoardScale([0.7, 0.7, 0.7]);
        setBoardPosition([0, 0.5, 0]);
      } else {
        setBoardScale([1.0, 1.0, 1.0]);
        setBoardPosition([0, 0, 0]);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const glowColor = pieceColor === 'white' ? '#f7f5ef' : '#9aa3ff'

  return (
    <>
      <color attach="background" args={['#050507']} />
      
      <EnvironmentErrorBoundary>
        <Suspense fallback={null}>
          <Environment preset="city" />
        </Suspense>
      </EnvironmentErrorBoundary>

      <ambientLight intensity={lightIntensity * 0.20} color="#e5e0da" />
      <directionalLight
        position={[-3.0, 6.5, 5.5]}
        intensity={lightIntensity * 1.9}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.8}
        shadow-camera-far={20}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0015}
      />
      <directionalLight position={[3.5, 3.5, -2.5]} intensity={lightIntensity * 0.8} color="#cbdfff" />

      {/* Main Board & Pieces Group */}
      <group ref={boardGroupRef} scale={boardScale} position={boardPosition}>
        <ChessBoard />
        <WhitePieces metalColor={metalColor} roughness={roughness} selectedId={selectedId} onSelect={onSelect} />
        <BlackPieces metalColor={metalColor} roughness={roughness} selectedId={selectedId} onSelect={onSelect} />
        <GlowPlane glowColor={glowColor} />
      </group>

      <ContactShadows position={[0, -0.72, 0]} opacity={0.6} scale={5.0} blur={3.0} far={1.5} color="#000" />
      <CameraController />
    </>
  )
}

export default function Scene(props: SceneProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3.2, 8.8], fov: 30, near: 0.1, far: 100 }}
      gl={{ antialias: true, toneMapping: 1, toneMappingExposure: 1.1 }}
    >
      <SceneContent {...props} />
    </Canvas>
  )
}
