import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CelestialBody } from "../api/bodies";
import { MS_PER_DAY } from "./ephemeris";
import {
  computeBodyPositions,
  getBodyOrbitCurve,
  getBodyVisualSpec,
  type Vec3,
} from "./orbitalLayout";

export interface SeekRequest {
  epochMs: number;
  nonce: number;
}

interface CosmosSceneProps {
  bodies: CelestialBody[];
  selectedSlug: string | null;
  onSelectBody: (slug: string) => void;
  isPlaying: boolean;
  daysPerSecond: number;
  epochMs: number;
  seekRequest: SeekRequest;
  resetSignal: number;
  onEpochTick: (epochMs: number) => void;
}

function Starfield() {
  const { geometry, material } = useMemo(() => {
    const count = 4500;
    const positions = new Float32Array(count * 3);
    let seed = 42;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i += 1) {
      const radius = 160 + nextRand() * 260;
      const theta = nextRand() * Math.PI * 2;
      const phi = Math.acos(2 * nextRand() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: "#dbeafe",
      size: 0.65,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.78,
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <points geometry={geometry} material={material} />;
}

interface OrbitPathProps {
  points: Vec3[];
  isSelected: boolean;
}

function OrbitPath({ points, isSelected }: OrbitPathProps) {
  const lineObject = useMemo(() => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    const material = new THREE.LineBasicMaterial({
      color: isSelected ? "#38bdf8" : "#334155",
      transparent: true,
      opacity: isSelected ? 0.88 : 0.45,
    });
    return new THREE.LineLoop(geometry, material);
  }, [points, isSelected]);

  useEffect(() => {
    return () => {
      lineObject.geometry.dispose();
      if (lineObject.material instanceof THREE.Material) {
        lineObject.material.dispose();
      }
    };
  }, [lineObject]);

  return <primitive object={lineObject} />;
}

function SolarSystemRig({
  bodies,
  selectedSlug,
  onSelectBody,
  isPlaying,
  daysPerSecond,
  epochMs,
  seekRequest,
  resetSignal,
  onEpochTick,
}: CosmosSceneProps) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRefs = useRef(new Map<string, THREE.Group>());
  const liveEpochRef = useRef<number>(epochMs);
  const lastReportWallMsRef = useRef<number>(0);
  const trackedPosRef = useRef<THREE.Vector3 | null>(null);
  const lastSelectedRef = useRef<string | null>(null);

  const curveEpochAnchor =
    Math.floor(epochMs / (365 * MS_PER_DAY)) * 365 * MS_PER_DAY;

  const specs = useMemo(
    () =>
      bodies.map((body, index) => {
        const spec = getBodyVisualSpec(body, index);
        const orbitCurve = getBodyOrbitCurve(body, spec, curveEpochAnchor);
        return { body, spec, orbitCurve };
      }),
    [bodies, curveEpochAnchor],
  );

  useEffect(() => {
    if (seekRequest.nonce === 0) {
      return;
    }
    liveEpochRef.current = seekRequest.epochMs;
    trackedPosRef.current = null;
  }, [seekRequest]);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 240;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    if (resetSignal === 0) {
      return;
    }
    camera.position.set(0, 32, 68);
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    trackedPosRef.current = null;
  }, [camera, resetSignal]);

  useFrame((state, delta) => {
    const clampedDelta = Math.min(delta, 0.1);
    if (isPlaying) {
      liveEpochRef.current += clampedDelta * daysPerSecond * MS_PER_DAY;
      const nowWall = state.clock.elapsedTime * 1000;
      if (nowWall - lastReportWallMsRef.current >= 140) {
        lastReportWallMsRef.current = nowWall;
        onEpochTick(liveEpochRef.current);
      }
    }

    const positions = computeBodyPositions(bodies, liveEpochRef.current);
    for (const [slug, coords] of Object.entries(positions)) {
      const group = groupRefs.current.get(slug);
      if (group) {
        group.position.set(coords[0], coords[1], coords[2]);
      }
    }

    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    if (selectedSlug && positions[selectedSlug]) {
      const [tx, ty, tz] = positions[selectedSlug];
      const currentTarget = new THREE.Vector3(tx, ty, tz);

      if (lastSelectedRef.current !== selectedSlug) {
        lastSelectedRef.current = selectedSlug;
        trackedPosRef.current = currentTarget.clone();
      } else if (trackedPosRef.current) {
        const moveDelta = currentTarget.clone().sub(trackedPosRef.current);
        camera.position.add(moveDelta);
        controls.target.add(moveDelta);
        trackedPosRef.current.copy(currentTarget);
      }

      controls.target.lerp(currentTarget, 0.12);
    } else {
      lastSelectedRef.current = null;
      trackedPosRef.current = null;
    }

    controls.update();
  });

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.35} />
      <pointLight
        position={[0, 0, 0]}
        intensity={2.8}
        distance={320}
        decay={0.45}
      />
      <Starfield />

      {specs.map(({ body, orbitCurve }) => {
        if (!orbitCurve) {
          return null;
        }
        return (
          <OrbitPath
            key={`orbit-${body.slug}`}
            points={orbitCurve}
            isSelected={selectedSlug === body.slug}
          />
        );
      })}

      {specs.map(({ body, spec }) => {
        const isSun = body.slug === "sun";
        const isSelected = selectedSlug === body.slug;
        return (
          <group
            key={body.slug}
            ref={(node) => {
              if (node) {
                groupRefs.current.set(body.slug, node);
              } else {
                groupRefs.current.delete(body.slug);
              }
            }}
          >
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                onSelectBody(body.slug);
              }}
            >
              {body.body_type === "spacecraft" ? (
                <octahedronGeometry args={[spec.visualRadius, 0]} />
              ) : (
                <sphereGeometry args={[spec.visualRadius, 32, 32]} />
              )}
              <meshStandardMaterial
                color={spec.color}
                emissive={spec.emissive}
                emissiveIntensity={isSun ? 1.8 : isSelected ? 0.9 : 0.25}
                roughness={isSun ? 0.2 : 0.72}
                metalness={body.body_type === "spacecraft" ? 0.7 : 0.1}
              />
            </mesh>

            {spec.hasRing && (
              <mesh rotation={[Math.PI / 2.35, 0.2, 0]}>
                <ringGeometry
                  args={[spec.visualRadius * 1.4, spec.visualRadius * 2.25, 64]}
                />
                <meshStandardMaterial
                  color="#d6b984"
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.72}
                />
              </mesh>
            )}

            {isSelected && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry
                  args={[spec.visualRadius * 1.55, spec.visualRadius * 1.72, 48]}
                />
                <meshBasicMaterial
                  color="#38bdf8"
                  side={THREE.DoubleSide}
                  transparent
                  opacity={0.9}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </>
  );
}

export function CosmosScene(props: CosmosSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 32, 68], fov: 48, near: 0.1, far: 1200 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <SolarSystemRig {...props} />
    </Canvas>
  );
}
