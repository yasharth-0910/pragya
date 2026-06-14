"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PointMaterial, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";

// The WebGL hero centrepiece (Phase 2). A field of slowly drifting points: most
// are warm paper-coloured ("noise"), a sparse few are brighter amber ("signal").
// That's the retrieval metaphor — finding the relevant few among many — and it
// stays strictly inside the ink-paper-amber palette.
//
// Deliberately NOT hand-written GLSL: drei's <PointMaterial> gives soft *round*
// points with one prop, so there's no opaque shader-compile failure mode. The
// "signal among noise" read comes from colour + size contrast across two point
// clouds, not from a custom glow shader.
//
// This module is only ever loaded via dynamic(() => …, { ssr:false }) on capable
// desktops (HeroBackdrop gates it), so it never blocks first paint and never
// ships to phones/reduced-motion users.

// Warm paper, toned a little under pure --paper so the amber clearly out-glows
// it. Amber is the exact --accent token.
const PAPER = new THREE.Color("#d8cfb8");
const AMBER = new THREE.Color("#e8c87e");

// Distribute points in a spherical SHELL (hollow centre). Viewed head-on a shell
// projects sparse in the middle and denser at the rim — a natural halo that
// leaves the headline area clean without needing any (banned) gradient scrim.
function shellPositions(count: number, rInner: number, rOuter: number) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rInner + Math.random() * (rOuter - rInner);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1); // uniform on the sphere
    const s = Math.sin(phi);
    arr[i * 3] = r * s * Math.cos(theta);
    arr[i * 3 + 1] = r * s * Math.sin(theta) * 0.8; // slightly flattened
    arr[i * 3 + 2] = r * Math.cos(phi);
  }
  return arr;
}

function Field({ paperCount, amberCount }: { paperCount: number; amberCount: number }) {
  const group = useRef<THREE.Group>(null);

  // Built once. Paper cloud carries a per-point colour buffer with a touch of
  // brightness jitter so the field doesn't look flat; amber cloud is one colour.
  const paper = useMemo(() => {
    const positions = shellPositions(paperCount, 2.0, 5.2);
    const colors = new Float32Array(paperCount * 3);
    for (let i = 0; i < paperCount; i++) {
      const j = 0.7 + Math.random() * 0.3; // 0.7..1.0 brightness
      colors[i * 3] = PAPER.r * j;
      colors[i * 3 + 1] = PAPER.g * j;
      colors[i * 3 + 2] = PAPER.b * j;
    }
    return { positions, colors };
  }, [paperCount]);

  const amber = useMemo(() => shellPositions(amberCount, 2.2, 5.0), [amberCount]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // Slow continuous auto-drift — premium, not gamey.
    g.rotation.y += delta * 0.022;
    // Gentle cursor parallax, eased toward the pointer so it's buttery, never
    // snappy. pointer is normalised -1..1.
    const lerp = THREE.MathUtils.lerp;
    g.rotation.x = lerp(g.rotation.x, state.pointer.y * 0.14, 0.035);
    g.position.x = lerp(g.position.x, state.pointer.x * 0.3, 0.035);
    g.position.y = lerp(g.position.y, state.pointer.y * 0.2, 0.035);
  });

  return (
    <group ref={group}>
      {/* Paper "noise" — many small soft points, varied warm tones. */}
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[paper.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[paper.colors, 3]} />
        </bufferGeometry>
        <PointMaterial
          vertexColors
          transparent
          size={0.028}
          sizeAttenuation
          depthWrite={false}
          opacity={0.85}
        />
      </points>

      {/* Amber "signal" — a sparse few, larger and brighter, with additive blend
          so they read as glowing among the paper field. */}
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[amber, 3]} />
        </bufferGeometry>
        <PointMaterial
          transparent
          color={AMBER}
          size={0.07}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

export default function HeroCanvas({ active = true }: { active?: boolean }) {
  // Adaptive starting DPR + particle count for weaker GPUs (Phase 5). Low-core
  // machines start with fewer points; PerformanceMonitor drops DPR if FPS sags.
  const lowEnd =
    typeof navigator !== "undefined" &&
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 4;
  const [dpr, setDpr] = useState(lowEnd ? 1 : 1.5);
  const paperCount = lowEnd ? 1500 : 2600;

  return (
    <Canvas
      // Transparent canvas: the section's ink background shows through, so the
      // look matches the CSS fallback and there's no flash on swap.
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={dpr}
      // Pause the render loop entirely once the hero scrolls out of view — no
      // GPU spent animating particles nobody can see.
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 6], fov: 60 }}
    >
      {/* If sustained FPS drops, step the device pixel ratio down to 1 (biggest
          cheap win — quarters the fragment work on retina). */}
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <Field paperCount={paperCount} amberCount={22} />
    </Canvas>
  );
}
