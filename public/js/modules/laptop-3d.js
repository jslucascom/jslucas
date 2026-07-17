/**
 * 3D Laptop Animation Module
 * Only renders when visible and when values are changing
 *
 * Ownership split with scroll-controls.js: this module owns the 3D scene,
 * the visual target values (scale/position/rotation/lid angle) and the
 * per-frame easing/render loop. It has no scroll-reading logic of its own
 * any more — scroll-controls.js's initLaptopSpin()/initLaptopGrow() own
 * every "when"/"how long" setting (trigger depth, duration, reveal timing)
 * and drive this module purely through setLaptopSpinTarget()/
 * setLaptopGrowTarget().
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===== DEVELOPMENT TOGGLE =====
const ANIMATIONS_ENABLED = true; // 👈 Change to true when you need the 3D laptop
// ==============================

// ============================================
// ANIMATION CONTROLS - EASY TO ADJUST
// ============================================
// Visual target values only. Every scroll-trigger "when"/"how long" setting
// (spin duration, grow start depth/duration, reveal lead time) now lives in
// scroll-controls.js's initLaptopSpin()/initLaptopGrow() and arrives here
// via setLaptopSpinTarget()/setLaptopGrowTarget()'s durationMs argument.
const animationControls = {
	// Scale animation (multiplier of base model size). Two stages, both
	// time-driven, reversible sequences:
	// startScale -> midScale plays while spinProgress travels toward
	// spinTarget (see setLaptopSpinTarget()).
	// midScale -> endScale plays while growProgress travels toward
	// growTarget (see setLaptopGrowTarget()).
	startScale: .65,
	midScale: 5,
	endScale: 15,

	// X-position animation (horizontal position)
	startX: -.9,
	endX: 0,

	// Y-position animation (vertical position). Same two-stage pattern as
	// scale above: startY -> midY tracks spinProgress, midY -> endY tracks
	// growProgress.
	startY: -.4,
	midY: -5.5,
	endY: -16,

	// Y-rotation animation (left/right spin)
	startRotationY: Math.PI * -1.24,
	endRotationY: 0,

	// X-rotation animation (tilt up/down)
	startRotationX: .1,
	endRotationX: -.35,

	// Floating animation
	floatingEnabled: false,
	floatingAmount: 0.15,
	floatingSpeed: 0.0005,

	// Lid hinge (degrees). Drives the "Bevels_2" node directly — this is
	// the model's screen/lid assembly, and its hinge rotates on a single
	// local axis, so we set it ourselves each frame instead of playing the
	// model's baked open-close clip. Tracks spinProgress, same as
	// rotationX/rotationY above.
	startLidAngle: 45,
	endLidAngle: 90
};

// ============================================
// LIGHTING CONTROLS
// ============================================
const lightingControls = {
	// Flat, directionless fill applied to every surface equally. Raising
	// this brightens the whole model at once — the broadest, blunter lever.
	// Was 8 — contributing a lot of the "washed out" flatness on the
	// exterior lid, since ambient hits every surface equally regardless
	// of angle. Dropped for more contrast/definition everywhere.
	ambientIntensity: 5,

	// Key light: the primary directional light, positioned above and in
	// front. Casts the main shadow.
	mainIntensity: 4,
	mainPosition: { x: 5, y: 10, z: 7 },

	// Light from behind the laptop. Its intensity is animated on scroll
	// (see dynamicBackLight below) rather than staying fixed.
	backLightEnabled: true,
	backIntensity: 4,
	backPosition: { x: 0, y: 5, z: -10 },

	// Soft blue-tinted light from the lower-left-behind, fills in shadows
	// left by the main light so that side doesn't go fully dark.
	fillIntensity: 4,
	fillPosition: { x: -5, y: 5, z: -5 },

	// When true, backLight intensity is interpolated between
	// backLightStartIntensity (spin start) and backLightEndIntensity
	// (spin end) each frame, instead of staying at backIntensity.
	dynamicBackLight: true,
	backLightStartIntensity: 3,
	backLightEndIntensity: 2,

	// Catches the exterior lid as it rotates into view — without this the
	// lid/Apple-logo panel sits in near-total darkness, since none of the
	// other lights are aimed at the camera-facing side. Was 9 — by far
	// the brightest light in the whole scene, which is why the exterior
	// lid read as too light/washed out. Dropped substantially; still
	// enough to keep the lid/logo visible rather than going flat black.
	lidIntensity: 3,
	lidPosition: { x: 0, y: 3, z: 10 },

	// Shines down onto the open interior (keyboard/trackpad), which none
	// of the other lights are really aimed at.
	keyboardIntensity: 2,
	keyboardPosition: { x: 0, y: 10, z: 2 }
};

// ============================================
// BASELINE DIMENSIONS FOR SCALING
// ============================================
// 16:9 render target. The canvas is scaled to fill 100vh (see
// handleResize below); width follows the ratio and is free to run past
// 100vw — no max-width cap, so it's never squashed horizontally.
const baselineWidth = 1600;
const baselineHeight = 900;

// ============================================
// MODULE STATE
// ============================================
let container = null;
let initialized = false; // guards the exported setters/render loop on pages with no laptop canvas

let isVisible = false;
let animationFrameId = null;
let isTabVisible = true;

let scene, camera, renderer, isMobile;
let laptop = null;
let lidNode = null; // "Bevels_2" — the model's screen/lid assembly, hinge-rotated directly (see updateLaptopTransform)
let backLight = null;
let baseScale = 1;

// Spin stage (startScale/Y -> midScale/Y) — time-driven, reversible.
// spinProgress is a raw 0-1 value that advances toward spinTarget at a
// constant rate over spinDurationMs (see updateLaptopTransform()). Both are
// set from outside via setLaptopSpinTarget() — scroll-controls.js's
// initLaptopSpin() owns when that happens and how long it takes.
let spinProgress = 0;
let spinTarget = 0;
let spinDurationMs = 1600; // fallback only — setLaptopSpinTarget() normally supplies this

// Grow stage (midScale/Y -> endScale/Y) — same pattern, driven by
// setLaptopGrowTarget() from scroll-controls.js's initLaptopGrow().
let growProgress = 0;
let growTarget = 0;
let growDurationMs = 2000; // fallback only — setLaptopGrowTarget() normally supplies this

let lastFrameTime = null; // for computing dt in the constant-rate progress updates; reset on render-loop (re)start so a long-idle gap doesn't cause one huge jump

// The lid's hinge keyframes (found by scanning the GLB's baked "open/close"
// clip) rotate purely around local axis (-1, 0, 0) — the quaternion at
// every sampled keyframe has zero Y/Z component. Reusing that exact axis
// means setLidAngle() below reproduces the model's own hinge motion
// exactly, just clamped to whatever start/end angle we choose.
const LID_HINGE_AXIS = new THREE.Vector3(-1, 0, 0);

function setLidAngle(degrees) {
	if (!lidNode) return;
	lidNode.quaternion.setFromAxisAngle(LID_HINGE_AXIS, THREE.MathUtils.degToRad(degrees));
}

// Easing function — used for both the spin and grow stages. Equivalent to
// CSS's cubic-bezier(0.64, 0, 0.78, 0) ("easeInQuint") — slow start,
// accelerating hard into the finish, no ease-out at the end.
function easeInQuint(t) {
	return t ** 5;
}

// ============================================
// PUBLIC API — driven entirely by scroll-controls.js
// ============================================

/**
 * Sets the spin stage's target (1 = open, 0 = closed) and, optionally, the
 * duration (ms) of a full 0->1 traverse at the constant rate used in
 * updateLaptopTransform(). Called by scroll-controls.js's initLaptopSpin()
 * — this module has no opinion on when spin should happen or how long it
 * takes, only how to play it.
 */
export function setLaptopSpinTarget(target, durationMs) {
	if (!initialized) return;
	if (typeof durationMs === 'number') spinDurationMs = durationMs;
	spinTarget = target;
	startRenderLoop();
}

/**
 * Sets the grow stage's target (1 = grown, 0 = ungrown) and duration (ms),
 * same shape as setLaptopSpinTarget(). Called by scroll-controls.js's
 * initLaptopGrow().
 */
export function setLaptopGrowTarget(target, durationMs) {
	if (!initialized) return;
	if (typeof durationMs === 'number') growDurationMs = durationMs;
	growTarget = target;
	startRenderLoop();
}

// ============================================
// OPTIMIZED RENDER LOOP - ONLY RUNS WHEN NEEDED
// ============================================
function shouldRender() {
	return isVisible && isTabVisible && laptop && (
		spinProgress !== spinTarget ||
		growProgress !== growTarget ||
		animationControls.floatingEnabled
	);
}

function startRenderLoop() {
	if (!initialized) return;
	if (!animationFrameId && shouldRender()) {
		console.log('▶ Starting render loop');
		lastFrameTime = null; // avoid one huge dt jump on the first frame after being stopped
		animate();
	}
}

function stopRenderLoop() {
	if (animationFrameId && !shouldRender()) {
		console.log('⏸ Stopping render loop');
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
}

// Applies the current transform for spinProgress and growProgress. Shared
// by the render loop and the one-off initial render so both use identical
// math — otherwise the laptop's pre-load pose (set directly in
// loadLaptopModel) doesn't match where this function would place it,
// causing a visible snap on the first frame.
function updateLaptopTransform() {
	const now = performance.now();
	const dt = lastFrameTime === null ? 0 : now - lastFrameTime;
	lastFrameTime = now;

	// Spin stage: spinProgress advances toward spinTarget at a constant
	// rate over real time (spinDurationMs per full 0->1 traverse), rather
	// than being locked to a fixed start time — this is what lets it
	// reverse cleanly mid-flight if setLaptopSpinTarget(0) arrives before
	// it finishes.
	if (spinProgress !== spinTarget) {
		const step = dt / spinDurationMs;
		spinProgress = spinTarget > spinProgress
			? Math.min(spinProgress + step, spinTarget)
			: Math.max(spinProgress - step, spinTarget);
	}

	// Grow stage: same constant-rate, reversible time-driven approach as
	// the spin stage above, just over growDurationMs instead of
	// spinDurationMs.
	if (growProgress !== growTarget) {
		const growStep = dt / growDurationMs;
		growProgress = growTarget > growProgress
			? Math.min(growProgress + growStep, growTarget)
			: Math.max(growProgress - growStep, growTarget);
	}

	// Single ease-in-out curve for each stage — eases in on the way open,
	// eases out on the way closed again, symmetric either direction.
	const easedProgress = easeInQuint(spinProgress);
	const growEasedProgress = easeInQuint(growProgress);

	// Animate Y-axis rotation
	laptop.rotation.y = animationControls.startRotationY -
		(easedProgress * (animationControls.startRotationY - animationControls.endRotationY));

	// Animate X-axis rotation
	laptop.rotation.x = animationControls.startRotationX + (easedProgress * animationControls.endRotationX);

	// Animate lid hinge angle (startLidAngle -> endLidAngle), same
	// progress curve as the Y-rotation above.
	if (lidNode) {
		const lidAngle = animationControls.startLidAngle +
			(easedProgress * (animationControls.endLidAngle - animationControls.startLidAngle));
		setLidAngle(lidAngle);
	}

	// Animate scale — stage 1 (startScale -> midScale) tracks spinProgress,
	// same as rotation/position; stage 2 (midScale -> endScale) is added on
	// top via growProgress, so the laptop keeps growing well after
	// rotation/position have settled.
	const stage1ScaleMultiplier = animationControls.startScale +
		(easedProgress * (animationControls.midScale - animationControls.startScale));
	const currentScaleMultiplier = stage1ScaleMultiplier +
		(growEasedProgress * (animationControls.endScale - animationControls.midScale));
	const currentScale = baseScale * currentScaleMultiplier;
	laptop.scale.setScalar(currentScale);

	// Animate X position (horizontal)
	const baseX = animationControls.startX +
		(easedProgress * (animationControls.endX - animationControls.startX));
	laptop.position.x = baseX;

	// Animate Y position (vertical) — same two-stage pattern as scale:
	// stage 1 (startY -> midY) tracks spinProgress, stage 2 (midY -> endY)
	// continues via growEasedProgress.
	const stage1Y = animationControls.startY +
		(easedProgress * (animationControls.midY - animationControls.startY));
	const baseY = stage1Y +
		(growEasedProgress * (animationControls.endY - animationControls.midY));

	// Add floating animation on top if enabled — fades out as the spin
	// stage reaches its end, so the laptop settles instead of jumping.
	let floatingOffset = 0;
	if (animationControls.floatingEnabled) {
		const floatingFade = 1 - spinProgress;
		const time = Date.now() * animationControls.floatingSpeed;
		floatingOffset = (Math.sin(time) * animationControls.floatingAmount +
			Math.sin(time * 0.5) * (animationControls.floatingAmount * 0.6)) * floatingFade;
	}

	laptop.position.y = baseY + floatingOffset;

	// Dynamic back light intensity
	if (backLight && lightingControls.dynamicBackLight) {
		backLight.intensity = lightingControls.backLightStartIntensity -
			(easedProgress * (lightingControls.backLightStartIntensity - lightingControls.backLightEndIntensity));
	}

	// Broadcast the grow stage's eased progress so other elements — e.g.
	// section#intro .h1-container in scroll-controls.js — can move in
	// exact lockstep with the laptop, frame for frame, rather than
	// approximating it with a separately-timed CSS animation.
	window.dispatchEvent(new CustomEvent('laptop3d:growprogress', { detail: growEasedProgress }));
}

// Optimized animation loop - only runs when needed
function animate() {
	if (!shouldRender()) {
		stopRenderLoop();
		return;
	}

	animationFrameId = requestAnimationFrame(animate);

	if (laptop) {
		updateLaptopTransform();
	}

	renderer.render(scene, camera);
}

// ============================================
// ENTRY POINT
// ============================================
export function initLaptop3D() {
	// Early exit if animations disabled
	if (!ANIMATIONS_ENABLED) {
		console.log('🎨 3D Laptop animation disabled for development');
		return;
	}

	container = document.getElementById('laptop-3d-canvas-container');

	// Exit if container doesn't exist (not on this page)
	if (!container) return;

	initialized = true;

	console.log('Initializing OPTIMIZED 3D Laptop Animation...');

	// Get asset paths from data attributes
	const assetsPath = {
		models: container.dataset.modelsPath
	};

	// Helper function to show errors
	function showError(message) {
		console.error(message);
		const errorDiv = document.getElementById('laptop-3d-error-message');
		const loadingDiv = document.getElementById('laptop-3d-loading');
		if (loadingDiv) loadingDiv.style.display = 'none';
		if (errorDiv) {
			errorDiv.style.display = 'block';
			errorDiv.innerHTML = `<strong>Error Loading Model</strong><br><br>${message}<br><br>Check browser console (F12) for details`;
		}
	}

	// Scene setup
	scene = new THREE.Scene();
	scene.background = null;

	// Camera
	camera = new THREE.PerspectiveCamera(
		45,
		baselineWidth / baselineHeight, // 16:9
		0.1,
		1000
	);
	camera.position.set(0, 2, 8);
	camera.lookAt(0, 0, 0);

	// Renderer with lower pixel ratio on mobile for better performance
	isMobile = window.innerWidth < 768;
	renderer = new THREE.WebGLRenderer({
		// MSAA is a real per-frame cost on this canvas (rendered up to
		// 3200x1800 at 2x pixel ratio, 7 lights, ~20 draw calls) and this is
		// exactly the render loop competing with the #intro SplitText reveal
		// for frame budget during scroll — worth trading away for smoother
		// scroll on every device, not just mobile. The CSS upscale (see
		// handleResize) already softens hard edges somewhat.
		antialias: false,
		alpha: true,
		powerPreference: 'high-performance'
	});
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
	renderer.shadowMap.enabled = false;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.0;

	container.appendChild(renderer.domElement);

	// Lighting setup
	const ambientLight = new THREE.AmbientLight(0xffffff, lightingControls.ambientIntensity);
	scene.add(ambientLight);

	const mainLight = new THREE.DirectionalLight(0xffffff, lightingControls.mainIntensity);
	mainLight.position.set(
		lightingControls.mainPosition.x,
		lightingControls.mainPosition.y,
		lightingControls.mainPosition.z
	);
	mainLight.castShadow = false;
	mainLight.shadow.mapSize.width = 2048;
	mainLight.shadow.mapSize.height = 2048;
	mainLight.shadow.camera.near = 0.5;
	mainLight.shadow.camera.far = 50;
	mainLight.shadow.radius = 8; // Blur radius for softer shadows
	mainLight.shadow.bias = -0.0001; // Prevent shadow acne
	scene.add(mainLight);

	if (lightingControls.backLightEnabled) {
		const initialBackIntensity = lightingControls.dynamicBackLight ?
			lightingControls.backLightStartIntensity :
			lightingControls.backIntensity;
		backLight = new THREE.DirectionalLight(0xffffff, initialBackIntensity);
		backLight.position.set(
			lightingControls.backPosition.x,
			lightingControls.backPosition.y,
			lightingControls.backPosition.z
		);
		scene.add(backLight);
	}

	const fillLight = new THREE.DirectionalLight(0x4477ff, lightingControls.fillIntensity);
	fillLight.position.set(
		lightingControls.fillPosition.x,
		lightingControls.fillPosition.y,
		lightingControls.fillPosition.z
	);
	scene.add(fillLight);

	// Rim light (warm orange edge highlight) removed — one of 7 lights in
	// this scene, each adding real per-fragment shader cost every frame
	// during scroll, and its contribution was the most purely decorative
	// (an edge glow separating the laptop from the background) rather than
	// structural like the others.

	// Lid light — lights the exterior lid/logo from the camera side so it
	// picks up a nice highlight as the laptop rotates, instead of sitting
	// in total darkness.
	const lidLight = new THREE.DirectionalLight(0xffffff, lightingControls.lidIntensity);
	lidLight.position.set(
		lightingControls.lidPosition.x,
		lightingControls.lidPosition.y,
		lightingControls.lidPosition.z
	);
	scene.add(lidLight);

	// Keyboard light — aimed down at the open interior so the keyboard and
	// trackpad read as lit rather than relying on the rim light's edge glow.
	const keyboardLight = new THREE.DirectionalLight(0xffffff, lightingControls.keyboardIntensity);
	keyboardLight.position.set(
		lightingControls.keyboardPosition.x,
		lightingControls.keyboardPosition.y,
		lightingControls.keyboardPosition.z
	);
	scene.add(keyboardLight);

	// ============================================
	// SHADOW PLANE - Creates shadow underneath objects
	// ============================================
	const shadowPlaneGeometry = new THREE.PlaneGeometry(20, 20);
	const shadowPlaneMaterial = new THREE.ShadowMaterial({
		opacity: 0,  // Shadow disabled
		transparent: true
	});
	const shadowPlane = new THREE.Mesh(shadowPlaneGeometry, shadowPlaneMaterial);
	shadowPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
	shadowPlane.position.y = -2.5; // Position below the laptop
	shadowPlane.receiveShadow = true;
	scene.add(shadowPlane);
	console.log('✓ Shadow plane added (disabled)');

	// Model file. The GLB embeds its own PBR textures and materials, so
	// there's no separate texture-loading pass to wait on — load straight in.
	const modelFile = assetsPath.models + '/macbook-lg.glb';

	loadLaptopModel();

	function loadLaptopModel() {
		const loader = new GLTFLoader();
		console.log('Starting to load model from:', modelFile);

		loader.load(
			modelFile,
			(gltf) => {
				console.log('✓ Model loaded successfully!');
				laptop = gltf.scene;

				// "Bevels_2" is the model's lid/screen assembly — its baked
				// clip is the open-close hinge, but we drive that angle
				// ourselves (see setLidAngle/animationControls.startLidAngle)
				// rather than playing the clip, so the hinge can track spin
				// progress between whatever start/end angle we choose instead
				// of the model's own fixed open-then-close-again motion.
				lidNode = laptop.getObjectByName('Bevels_2');
				if (lidNode) {
					setLidAngle(animationControls.startLidAngle);
				} else {
					console.warn('⚠ Could not find "Bevels_2" lid node on this model — lid angle controls will have no effect.');
				}

				// Screen material — deliberately UNLIT, same reasoning as the
				// previous OBJ setup: a real screen displays at its own fixed
				// brightness rather than reflecting room light, so a lit
				// material here would catch every lighting tweak as a
				// specular hotspot.
				//
				// The actual display panel is "Material.002" — confirmed by
				// bounding box (roughly 1.04 x 0.65 units, matching the full
				// screen face). It ships with a baked-in photo of the model
				// author's own Sketchfab profile (trains and all) as its
				// baseColorTexture, which is what was showing through.
				// "Glass" (previously swapped here) turned out to be an
				// unrelated tiny sliver — a lens/indicator detail, not the
				// screen — so it's left alone now. Flat unlit off-white
				// (matching $off-white / #EDE9DE from the site's own palette)
				// replaces the baked photo, reproducing the old texture's
				// "screen glowing on" look without needing an image at all.
				const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xede9de });

				laptop.traverse((child) => {
					if (child.isMesh) {
						if (child.material && child.material.name === 'Material.002') {
							child.material = screenMaterial;
						}

						// "Object_4" (material "Black_Glass") sits almost exactly
						// coincident with the screen mesh above — local Y range
						// ~0.0092-0.0106 vs the screen's ~0.0102-0.0105, a gap of
						// roughly 0.0002 units. Once the scroll animation scales
						// the laptop up to 14x, that's well within z-fighting
						// range: the two surfaces flicker against each other as
						// the model rotates (visible as black squares flashing
						// on the screen). The old lap-top.obj model never had
						// this coincident glass-overlay mesh, which is why the
						// glitch only showed up after switching to this GLB.
						// (Confirmed via a runtime console.log dump of every
						// mesh's real name/material/bbox as parsed by
						// GLTFLoader — node numbering here doesn't match a
						// Node.js-side glTF inspection, which is why this was
						// "Object_0" in an earlier, incorrect version of this
						// fix that silently never matched anything.)
						// polygonOffset nudges it behind the screen in the depth
						// buffer without moving the actual geometry, so the
						// glass still renders — reliably behind the display
						// instead of fighting with it. Cloned first since
						// "Black_Glass" is reused by another, unrelated mesh
						// elsewhere on the model (a trim piece, not coincident
						// with anything) that shouldn't be affected.
						if (child.name === 'Object_4') {
							child.material = child.material.clone();
							child.material.polygonOffset = true;
							child.material.polygonOffsetFactor = 4;
							child.material.polygonOffsetUnits = 4;
						}

						child.castShadow = true;
						child.receiveShadow = true;
					}
				});

				// Center and scale the model
				const box = new THREE.Box3().setFromObject(laptop);
				const center = box.getCenter(new THREE.Vector3());
				const size = box.getSize(new THREE.Vector3());

				console.log('Model size:', size);
				console.log('Model center:', center);

				const maxDim = Math.max(size.x, size.y, size.z);
				baseScale = 3 / maxDim;

				const initialScale = baseScale * animationControls.startScale;
				laptop.scale.setScalar(initialScale);

				laptop.position.sub(center.multiplyScalar(baseScale * animationControls.startScale));
				laptop.position.y = animationControls.startY;

				laptop.rotation.y = animationControls.startRotationY;
				laptop.rotation.x = animationControls.startRotationX;

				scene.add(laptop);

				console.log('✓ Model added to scene successfully!');

				const loadingDiv = document.getElementById('laptop-3d-loading');
				if (loadingDiv) loadingDiv.style.display = 'none';

				// Render once immediately so the laptop is visible on load —
				// shouldRender() won't fire on its own until spin/grow are
				// triggered or the tab/visibility state changes, now that
				// floating is off. Run it through the same transform as the
				// render loop so the pose matches exactly (no snap on the
				// first triggered frame).
				updateLaptopTransform();
				renderer.render(scene, camera);

				// Start render loop now that model is loaded (a no-op unless
				// setLaptopSpinTarget()/setLaptopGrowTarget() have already
				// been called with a target that differs from progress)
				startRenderLoop();
			},
			(xhr) => {
				const percentComplete = xhr.total > 0 ? (xhr.loaded / xhr.total) * 100 : 0;
				console.log(`Loading progress: ${Math.round(percentComplete)}%`);
				const loadingDiv = document.getElementById('laptop-3d-loading');
				if (loadingDiv) {
					loadingDiv.textContent = `Loading: ${Math.round(percentComplete)}%`;
				}
			},
			(error) => {
				console.error('✗ Error loading GLB model:', error);
				showError(`Failed to load macbook-lg.glb file.<br><br>Expected location: ${modelFile}<br><br>Error: ${error.message || 'Unknown error'}`);
			}
		);
	}

	// ============================================
	// VISIBILITY OBSERVERS
	// ============================================

	// IntersectionObserver - only render when laptop is visible
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			isVisible = entry.isIntersecting;
			console.log('Laptop visibility changed:', isVisible);

			if (isVisible) {
				startRenderLoop();
			} else {
				stopRenderLoop();
			}
		});
	}, {
		threshold: 0.1 // Trigger when 10% visible
	});

	observer.observe(container);

	// Page Visibility API - pause when tab is inactive
	document.addEventListener('visibilitychange', () => {
		isTabVisible = !document.hidden;
		console.log('Tab visibility changed:', isTabVisible);

		if (isTabVisible && isVisible) {
			startRenderLoop();
		} else {
			stopRenderLoop();
		}
	});

	// Handle window resize - scale canvas via CSS
	function handleResize() {

		renderer.setSize(baselineWidth, baselineHeight); // Fixed 16:9 size, not window size
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
		const currentWidth = window.innerWidth;
		const currentHeight = window.innerHeight;

		// Scale to fill viewport height. Width follows the fixed 16:9 ratio
		// automatically — no separate width cap — so it's never stretched or
		// squashed off-ratio. If the resulting width exceeds the viewport,
		// it simply overflows past the left/right edges (hidden by the
		// browser, not cropped by the canvas itself).
		const scale = currentHeight / baselineHeight;
		const scaledWidth = baselineWidth * scale;

		// Centre horizontally.
		const offsetX = (currentWidth - scaledWidth) / 2;

		renderer.domElement.style.transform = `translateX(${offsetX}px) scale(${scale})`;
		renderer.domElement.style.transformOrigin = 'top left';

		// Keep canvas rendering at baseline size (not window size)
		// Don't call renderer.setSize() on every resize!

		// Camera aspect stays fixed at 16:9 — matches the baseline render
		// target, which never changes shape.

		console.log('📐 Window:', currentWidth + 'px', '| Canvas scale:', scale.toFixed(3));

		// Single render
		if (laptop && isVisible && isTabVisible) {
			renderer.render(scene, camera);
		}
	}

	window.addEventListener('resize', handleResize);

	// Call immediately so the canvas starts at baseline resolution (1600×900)
	// with CSS scaling — not at full Retina window size which costs 4× the GPU work
	handleResize();
}
