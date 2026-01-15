import React, { Suspense } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { Canvas, useLoader } from '@react-three/fiber/native'
import { GLTFLoader } from 'three-stdlib'
import * as THREE from 'three'

function Model({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url)
  return <primitive object={gltf.scene as THREE.Object3D} />
}

export default function Model3DView({ url }: { url: string }) {
  if (!url) return null

  return (
    <View style={styles.wrap}>
      <Canvas camera={{ position: [0, 1.5, 3], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[3, 3, 3]} intensity={1} />
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
      </Canvas>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { height: 260, width: '100%' },
})
