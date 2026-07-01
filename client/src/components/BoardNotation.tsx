import { Text } from '@react-three/drei';

const FILE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const RANK_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8']
const LABEL_POSITIONS = Array.from({ length: 8 }, (_, index) => -1.925 + index * 0.55)

export default function BoardNotation() {
  return (
    <group>
      {FILE_LABELS.map((label, index) => {
        const x = LABEL_POSITIONS[index]
        return (
          <group key={`file-${label}`}>
            <Text
              position={[x, 0.02, -2.5]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.13}
              color="#f3ede8"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
            <Text
              position={[x, 0.02, 2.5]}
              rotation={[Math.PI / 2, 0, Math.PI]}
              fontSize={0.13}
              color="#f3ede8"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
          </group>
        )
      })}

      {RANK_LABELS.map((label, index) => {
        const z = LABEL_POSITIONS[index]
        return (
          <group key={`rank-${label}`}>
            <Text
              position={[-2.5, 0.02, z]}
              rotation={[-Math.PI / 2, 0, Math.PI / 2]}
              fontSize={0.13}
              color="#f3ede8"
              anchorX="center"
              anchorY="middle"
            >
              {label}
            </Text>
            <Text
              position={[2.5, 0.02, z]}
              rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
              fontSize={0.13}
              color="#f3ede8"
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
