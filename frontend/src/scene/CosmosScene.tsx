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
  getSpacecraftTrajectoryCurve,
  type Vec3,
} from "./orbitalLayout";

export type ViewScale = "solar" | "galactic";

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
  showLabels?: boolean;
  viewScale?: ViewScale;
  telemetryTrail?: Vec3[];
  onEpochTick: (epochMs: number) => void;
}

const AXIAL_TILT_RAD: Record<string, number> = {
  earth: 0.409,
  mars: 0.439,
  jupiter: 0.055,
  saturn: 0.466,
  uranus: 1.706,
  neptune: 0.494,
};

function deterministicUnit(index: number, channel: number): number {
  let h = (index * 374761393 + channel * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function Starfield() {
  const { geometry, material } = useMemo(() => {
    const count = 4500;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const radius = 160 + deterministicUnit(i, 1) * 340;
      const theta = deterministicUnit(i, 2) * Math.PI * 2;
      const phi = Math.acos(2 * deterministicUnit(i, 3) - 1);
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

function MilkyWayDisc({ visible }: { visible: boolean }) {
  const { geometry, material } = useMemo(() => {
    const starCount = 14000;
    const arms = 4;
    const maxRadius = 260;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    const coreColor = new THREE.Color("#fde68a");
    const armInnerColor = new THREE.Color("#93c5fd");
    const armOuterColor = new THREE.Color("#67e8f9");

    for (let i = 0; i < starCount; i += 1) {
      const u1 = deterministicUnit(i, 11);
      const u2 = deterministicUnit(i, 12);
      const u3 = deterministicUnit(i, 13);

      const t = Math.pow(u1, 1.35);
      const radius = 8 + t * maxRadius;
      const armIndex = i % arms;
      const armBaseAngle = (armIndex / arms) * Math.PI * 2;
      const twist = radius * 0.032;
      const scatter = (u2 - 0.5) * (0.42 + t * 0.55);
      const angle = armBaseAngle + twist + scatter;

      const thickness = (1 - t * 0.75) * 14 * (u3 - 0.5);
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = thickness;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const c =
        t < 0.25
          ? coreColor.clone().lerp(armInnerColor, t / 0.25)
          : armInnerColor.clone().lerp(armOuterColor, (t - 0.25) / 0.75);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 1.35,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  if (!visible) {
    return null;
  }

  return (
    <group rotation={[0.28, 0, -0.14]}>
      <points geometry={geometry} material={material} />
    </group>
  );
}

interface BodyLabelProps {
  text: string;
  offsetY: number;
  isSelected: boolean;
}

function BodyLabel({ text, offsetY, isSelected }: BodyLabelProps) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = isSelected
        ? "600 22px Inter, system-ui, sans-serif"
        : "500 20px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const metrics = ctx.measureText(text);
      const pillW = Math.min(248, Math.max(96, metrics.width + 28));
      const pillH = 38;
      const x = (canvas.width - pillW) / 2;
      const y = (canvas.height - pillH) / 2;

      ctx.fillStyle = isSelected
        ? "rgba(14, 116, 144, 0.85)"
        : "rgba(15, 23, 42, 0.72)";
      ctx.strokeStyle = isSelected
        ? "rgba(56, 189, 248, 0.95)"
        : "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, pillW, pillH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isSelected ? "#f8fafc" : "#cbd5e1";
      ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [text, isSelected]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite position={[0, offsetY, 0]} scale={[3.8, 0.95, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
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

interface MissionTrajectoryPathProps {
  points: Vec3[];
  closed: boolean;
  color: string;
  isSelected: boolean;
}

function MissionTrajectoryPath({
  points,
  closed,
  color,
  isSelected,
}: MissionTrajectoryPathProps) {
  const lineObject = useMemo(() => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: isSelected ? 0.95 : 0.44,
    });
    return closed
      ? new THREE.LineLoop(geometry, material)
      : new THREE.Line(geometry, material);
  }, [points, closed, color, isSelected]);

  useEffect(() => {
    return () => {
      lineObject.geometry.dispose();
      if (lineObject.material instanceof THREE.Material) {
        lineObject.material.dispose();
      }
    };
  }, [lineObject]);

  if (points.length < 2) {
    return null;
  }

  return <primitive object={lineObject} />;
}

function TelemetryTrailPath({ points }: { points: Vec3[] }) {
  const lineObject = useMemo(() => {
    const vectors = points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(vectors);
    const material = new THREE.LineBasicMaterial({
      color: "#34d399",
      transparent: true,
      opacity: 0.95,
    });
    return new THREE.Line(geometry, material);
  }, [points]);

  useEffect(() => {
    return () => {
      lineObject.geometry.dispose();
      if (lineObject.material instanceof THREE.Material) {
        lineObject.material.dispose();
      }
    };
  }, [lineObject]);

  if (points.length < 2) {
    return null;
  }

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
  showLabels = true,
  viewScale = "solar",
  telemetryTrail = [],
  onEpochTick,
}: CosmosSceneProps) {
  const { camera, gl } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const groupRefs = useRef(new Map<string, THREE.Group>());
  const spinMeshRefs = useRef(new Map<string, THREE.Mesh>());
  const liveEpochRef = useRef<number>(epochMs);
  const lastReportWallMsRef = useRef<number>(0);
  const trackedPosRef = useRef<THREE.Vector3 | null>(null);
  const lastSelectedRef = useRef<string | null>(null);
  const flyGoalPosRef = useRef<THREE.Vector3 | null>(null);
  const scaleGoalPosRef = useRef<THREE.Vector3 | null>(null);
  const lastViewScaleRef = useRef<ViewScale>(viewScale);

  const curveEpochAnchor =
    Math.floor(epochMs / (365 * MS_PER_DAY)) * 365 * MS_PER_DAY;

  const specs = useMemo(
    () =>
      bodies.map((body, index) => {
        const spec = getBodyVisualSpec(body, index);
        const orbitCurve = getBodyOrbitCurve(body, spec, curveEpochAnchor);
        const missionTrajectory = getSpacecraftTrajectoryCurve(
          body,
          curveEpochAnchor,
        );
        return { body, spec, orbitCurve, missionTrajectory };
      }),
    [bodies, curveEpochAnchor],
  );

  const visualRadiusBySlug = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of specs) {
      map.set(item.body.slug, item.spec.visualRadius);
    }
    return map;
  }, [specs]);

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

    const cancelFlyTo = () => {
      flyGoalPosRef.current = null;
      scaleGoalPosRef.current = null;
    };
    controls.addEventListener("start", cancelFlyTo);

    return () => {
      controls.removeEventListener("start", cancelFlyTo);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl]);

  useEffect(() => {
    if (resetSignal === 0) {
      return;
    }
    flyGoalPosRef.current = null;
    scaleGoalPosRef.current = null;
    const isGalactic = viewScale === "galactic";
    camera.position.set(0, isGalactic ? 145 : 32, isGalactic ? 210 : 68);
    if (controlsRef.current) {
      controlsRef.current.maxDistance = isGalactic ? 520 : 240;
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    trackedPosRef.current = null;
  }, [camera, resetSignal, viewScale]);

  useEffect(() => {
    if (lastViewScaleRef.current === viewScale) {
      return;
    }
    lastViewScaleRef.current = viewScale;
    flyGoalPosRef.current = null;
    trackedPosRef.current = null;

    if (viewScale === "galactic") {
      if (controlsRef.current) {
        controlsRef.current.maxDistance = 520;
      }
      scaleGoalPosRef.current = new THREE.Vector3(0, 145, 210);
    } else {
      if (controlsRef.current) {
        controlsRef.current.maxDistance = 240;
      }
      scaleGoalPosRef.current = new THREE.Vector3(0, 32, 68);
    }
  }, [viewScale]);

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
      const mesh = spinMeshRefs.current.get(slug);
      if (mesh) {
        mesh.rotation.y += clampedDelta * (slug === "sun" ? 0.12 : 0.45);
      }
    }

    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    if (viewScale === "galactic" && !selectedSlug) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1);
      if (scaleGoalPosRef.current) {
        camera.position.lerp(scaleGoalPosRef.current, 0.06);
        if (camera.position.distanceTo(scaleGoalPosRef.current) < 0.8) {
          scaleGoalPosRef.current = null;
        }
      }
      controls.update();
      return;
    }

    if (scaleGoalPosRef.current && !selectedSlug) {
      controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1);
      camera.position.lerp(scaleGoalPosRef.current, 0.07);
      if (camera.position.distanceTo(scaleGoalPosRef.current) < 0.4) {
        scaleGoalPosRef.current = null;
      }
    }

    if (selectedSlug && positions[selectedSlug]) {
      scaleGoalPosRef.current = null;
      const [tx, ty, tz] = positions[selectedSlug];
      const currentTarget = new THREE.Vector3(tx, ty, tz);

      if (lastSelectedRef.current !== selectedSlug) {
        lastSelectedRef.current = selectedSlug;
        trackedPosRef.current = currentTarget.clone();

        const radius = visualRadiusBySlug.get(selectedSlug) ?? 0.6;
        const viewDist = Math.max(4.5, radius * 6.2 + 2.8);
        const dir = camera.position.clone().sub(currentTarget);
        if (dir.lengthSq() < 0.01) {
          dir.set(0, 0.45, 1);
        }
        dir.normalize();
        flyGoalPosRef.current = currentTarget
          .clone()
          .add(dir.multiplyScalar(viewDist))
          .add(new THREE.Vector3(0, viewDist * 0.22, 0));
      } else if (trackedPosRef.current) {
        const moveDelta = currentTarget.clone().sub(trackedPosRef.current);
        camera.position.add(moveDelta);
        controls.target.add(moveDelta);
        if (flyGoalPosRef.current) {
          flyGoalPosRef.current.add(moveDelta);
        }
        trackedPosRef.current.copy(currentTarget);
      }

      if (flyGoalPosRef.current) {
        camera.position.lerp(flyGoalPosRef.current, 0.09);
        if (camera.position.distanceTo(flyGoalPosRef.current) < 0.12) {
          flyGoalPosRef.current = null;
        }
      }

      controls.target.lerp(currentTarget, 0.14);
    } else {
      lastSelectedRef.current = null;
      trackedPosRef.current = null;
      flyGoalPosRef.current = null;
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
      <MilkyWayDisc visible={viewScale === "galactic"} />

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

      {specs.map(({ body, spec, missionTrajectory }) => {
        if (!missionTrajectory) {
          return null;
        }
        return (
          <MissionTrajectoryPath
            key={`mission-${body.slug}`}
            points={missionTrajectory.points}
            closed={missionTrajectory.closed}
            color={spec.color}
            isSelected={selectedSlug === body.slug}
          />
        );
      })}

      <TelemetryTrailPath points={telemetryTrail} />

      {specs.map(({ body, spec }) => {
        const isSun = body.slug === "sun";
        const isSelected = selectedSlug === body.slug;
        const tilt = AXIAL_TILT_RAD[body.slug] ?? 0;

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
            <group rotation={[0, 0, tilt]}>
              <mesh
                ref={(node) => {
                  if (node) {
                    spinMeshRefs.current.set(body.slug, node);
                  } else {
                    spinMeshRefs.current.delete(body.slug);
                  }
                }}
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
                <mesh rotation={[Math.PI / 2, 0, 0]}>
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
            </group>

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

            {showLabels && (
              <BodyLabel
                text={body.name}
                offsetY={spec.visualRadius + 0.95}
                isSelected={isSelected}
              />
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
      camera={{ position: [0, 32, 68], fov: 48, near: 0.1, far: 1600 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%" }}
    >
      <SolarSystemRig {...props} />
    </Canvas>
  );
}
