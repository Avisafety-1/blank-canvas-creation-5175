import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

interface Drone3DViewerProps {
  pitch: number;  // degrees, positive = nose up
  roll: number;   // degrees, positive = right roll
  yaw?: number;   // heading degrees
}

const DEG2RAD = Math.PI / 180;

function DroneModel({ pitch, roll, yaw }: Drone3DViewerProps) {
  const { scene } = useGLTF("/models/dji_matrice_t300/scene.gltf");
  const groupRef = useRef<THREE.Group>(null);

  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  // Center and scale the model
  useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.75 / maxDim;
    clonedScene.scale.setScalar(scale);
    clonedScene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  }, [clonedScene]);

  // Smoothly interpolate rotation
  const targetRotation = useRef(new THREE.Euler(0, 0, 0));

  useFrame(() => {
    if (!groupRef.current) return;
    // Convert telemetry to rotation: pitch around X, yaw around Y, roll around Z
    targetRotation.current.set(
      pitch * DEG2RAD,
      yaw !== undefined ? -yaw * DEG2RAD : 0,
      -roll * DEG2RAD,
      "YXZ"
    );
    const target = new THREE.Quaternion().setFromEuler(targetRotation.current);
    const current = groupRef.current.quaternion;
    current.slerp(target, 0.15);
  });

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}

export const Drone3DViewer = ({ pitch, roll, yaw }: Drone3DViewerProps) => {
  return (
    <div className="w-[108px] h-[108px] sm:h-full sm:w-auto sm:aspect-square sm:max-w-[280px] rounded-lg bg-background/80 backdrop-blur-sm border border-border shadow-lg flex flex-col items-center justify-center overflow-hidden">
      <div className="w-full flex-1 min-h-0">
        <Canvas
          camera={{ position: [0, 1.5, 4], fov: 40 }}
          gl={{ alpha: true, antialias: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <directionalLight position={[-3, 2, -3]} intensity={0.4} />
          <DroneModel pitch={pitch} roll={roll} yaw={yaw} />
          <Environment preset="city" />
        </Canvas>
      </div>
      {yaw !== undefined && (
        <span className="text-[11px] font-mono text-muted-foreground leading-none pb-1">
          {Math.round(((yaw % 360) + 360) % 360)}°
        </span>
      )}
    </div>
  );
};

// Preload the model
useGLTF.preload("/models/dji_matrice_t300/scene.gltf");
