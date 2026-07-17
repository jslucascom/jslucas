/**
 * 3D Laptop Animation Module — scene, transform targets, render loop.
 * Driven by scroll-controls.js's initLaptopSpin() via setLaptopSpinTarget(); no scroll logic of its own.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ===== DEVELOPMENT TOGGLE =====
const ANIMATIONS_ENABLED = true; // set false to disable the 3D laptop
// ==============================

// ============================================
// ANIMATION CONTROLS
// ============================================
// Visual target values only — timing/duration comes from scroll-controls.js via setLaptopSpinTarget().
const animationControls = {
	// Scale (multiplier of base model size), tracks spinProgress.
	startScale: .65,
	endScale: 5, // was midScale before the grow stage was removed — old endScale (15) was the grow stage's target, not spin's

	// X position (horizontal), tracks spinProgress.
	startX: -.9,
	endX: 0,

	// Y position (vertical), tracks spinProgress.
	startY: -.4,
	endY: -5.5, // was midY before the grow stage was removed — old endY (-16) was the grow stage's target, not spin's

	// Y-rotation (left/right spin), tracks spinProgress.
	startRotationY: Math.PI * -1.24,
	endRotationY: 0,

	// X-rotation (tilt), tracks spinProgress.
	startRotationX: .1,
	endRotationX: -.35,

	// Floating animation
	floatingEnabled: false,
	floatingAmount: 0.15,
	floatingSpeed: 0.0005,

	// Lid hinge (degrees) — drives the "Bevels_2" node directly, tracks spinProgress.
	startLidAngle: 45,
	endLidAngle: 90
};

// ============================================
// LIGHTING CONTROLS
// ============================================
const lightingControls = {
	// Flat ambient fill applied evenly to every surface.
	ambientIntensity: 5,

	// Key light — primary directional light, casts the main shadow.
	mainIntensity: 4,
	mainPosition: { x: 5, y: 10, z: 7 },

	// Back light — intensity animated on scroll, see dynamicBackLight below.
	backLightEnabled: true,
	backIntensity: 4,
	backPosition: { x: 0, y: 5, z: -10 },

	// Fill light — softens shadows left by the main light.
	fillIntensity: 4,
	fillPosition: { x: -5, y: 5, z: -5 },

	// When true, backLight intensity interpolates between start/end each frame.
	dynamicBackLight: true,
	backLightStartIntensity: 3,
	backLightEndIntensity: 2,

	// Lid light — highlights the exterior lid/logo as it rotates into view.
	lidIntensity: 3,
	lidPosition: { x: 0, y: 3, z: 10 },

	// Keyboard light — lights the open interior (keyboard/trackpad).
	keyboardIntensity: 2,
	keyboardPosition: { x: 0, y: 10, z: 2 }
};

// ============================================
// BASELINE DIMENSIONS
// ============================================
// 16:9 render target, scaled to fill 100vh — see handleResize().
const baselineWidth = 1600;
const baselineHeight = 900;

// ============================================
// MODULE STATE
// ============================================
let container = null;
let initialized = false; // guards setters/render loop when there's no laptop canvas on the page

let isVisible = false;
let animationFrameId = null;
let isTabVisible = true;

let scene, camera, renderer, isMobile;
let laptop = null;
let lidNode = null; // "Bevels_2" — the lid/screen assembly, hinge-rotated directly
let backLight = null;
let baseScale = 1;

// Spin stage — spinProgress advances toward spinTarget at a constant rate over spinDurationMs.
// Set via setLaptopSpinTarget(), called by scroll-controls.js's initLaptopSpin().
let spinProgress = 0;
let spinTarget = 0;
let spinDurationMs = 1600; // fallback only

let lastFrameTime = null; // for computing dt; reset on render-loop restart to avoid a big first-frame jump

// Lid hinge rotates purely around local axis (-1, 0, 0), matching the GLB's baked clip.
const LID_HINGE_AXIS = new THREE.Vector3(-1, 0, 0);

function setLidAngle(degrees) {
	if (!lidNode) return;
	lidNode.quaternion.setFromAxisAngle(LID_HINGE_AXIS, THREE.MathUtils.degToRad(degrees));
}

// Equivalent to cubic-bezier(0.64, 0, 0.78, 0) — slow start, hard finish.
function easeInQuint(t) {
	return t ** 5;
}

// ============================================
// PUBLIC API
// ============================================

// Sets the spin target (1 = open, 0 = closed) and optional duration (ms). Called by initLaptopSpin().
export function setLaptopSpinTarget(target, durationMs) {
	if (!initialized) return;
	if (typeof durationMs === 'number') spinDurationMs = durationMs;
	spinTarget = target;
	startRenderLoop();
}

// ============================================
// RENDER LOOP — only runs when needed
// ============================================
function shouldRender() {
	return isVisible && isTabVisible && laptop && (
		spinProgress !== spinTarget ||
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

// Applies the current transform for spinProgress. Shared by the render loop and the initial render.
function updateLaptopTransform() {
	const now = performance.now();
	const dt = lastFrameTime === null ? 0 : now - lastFrameTime;
	lastFrameTime = now;

	// spinProgress advances toward spinTarget at a constant rate so it can reverse cleanly mid-flight.
	if (spinProgress !== spinTarget) {
		const step = dt / spinDurationMs;
		spinProgress = spinTarget > spinProgress
			? Math.min(spinProgress + step, spinTarget)
			: Math.max(spinProgress - step, spinTarget);
	}

	const easedProgress = easeInQuint(spinProgress);

	laptop.rotation.y = animationControls.startRotationY -
		(easedProgress * (animationControls.startRotationY - animationControls.endRotationY));

	laptop.rotation.x = animationControls.startRotationX + (easedProgress * animationControls.endRotationX);

	// Lid hinge angle, same progress curve as rotation above.
	if (lidNode) {
		const lidAngle = animationControls.startLidAngle +
			(easedProgress * (animationControls.endLidAngle - animationControls.startLidAngle));
		setLidAngle(lidAngle);
	}

	// Scale: startScale -> endScale.
	const currentScaleMultiplier = animationControls.startScale +
		(easedProgress * (animationControls.endScale - animationControls.startScale));
	const currentScale = baseScale * currentScaleMultiplier;
	laptop.scale.setScalar(currentScale);

	// X position (horizontal): startX -> endX.
	const baseX = animationControls.startX +
		(easedProgress * (animationControls.endX - animationControls.startX));
	laptop.position.x = baseX;

	// Y position (vertical): startY -> endY.
	const baseY = animationControls.startY +
		(easedProgress * (animationControls.endY - animationControls.startY));

	// Floating animation on top, fades out as spin nears its end.
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

	container = document.getElementById('laptop-3d-canvas-inner');

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
		// MSAA is costly here and competes with scroll for frame budget — traded off for smoother scroll.
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

	// Rim light removed — decorative only, not worth the per-frame cost.

	// Lid light — highlights the exterior lid/logo as it rotates into view.
	const lidLight = new THREE.DirectionalLight(0x000000, lightingControls.lidIntensity);
	lidLight.position.set(
		lightingControls.lidPosition.x,
		lightingControls.lidPosition.y,
		lightingControls.lidPosition.z
	);
	scene.add(lidLight);

	// Keyboard light — lights the open interior (keyboard/trackpad).
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

	// GLB embeds its own textures/materials — no separate loading pass needed.
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

				// "Bevels_2" is the lid/screen hinge node — angle driven manually via setLidAngle(), not the baked clip.
				lidNode = laptop.getObjectByName('Bevels_2');
				if (lidNode) {
					setLidAngle(animationControls.startLidAngle);
				} else {
					console.warn('⚠ Could not find "Bevels_2" lid node on this model — lid angle controls will have no effect.');
				}

				// Screen ("Material.002") is unlit flat off-white — a real screen shouldn't catch scene lighting.
				const screenMaterial = new THREE.MeshBasicMaterial({ color: 0xede9de });

				laptop.traverse((child) => {
					if (child.isMesh) {
						if (child.material && child.material.name === 'Material.002') {
							child.material = screenMaterial;
						}

						// "Object_4" z-fights with the screen at scroll-scale — polygonOffset nudges it behind.
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

				// Render once immediately so the laptop is visible before spin triggers.
				updateLaptopTransform();
				renderer.render(scene, camera);

				// No-op unless setLaptopSpinTarget() has already set a different target.
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

		// Scale to fill viewport height — width follows the fixed 16:9 ratio, can overflow left/right.
		const scale = currentHeight / baselineHeight;
		const scaledWidth = baselineWidth * scale;

		// Centre horizontally.
		const offsetX = (currentWidth - scaledWidth) / 2;

		renderer.domElement.style.transform = `translateX(${offsetX}px) scale(${scale})`;
		renderer.domElement.style.transformOrigin = 'top left';

		console.log('📐 Window:', currentWidth + 'px', '| Canvas scale:', scale.toFixed(3));

		// Single render
		if (laptop && isVisible && isTabVisible) {
			renderer.render(scene, camera);
		}
	}

	window.addEventListener('resize', handleResize);

	// Render at fixed baseline resolution, scaled via CSS — avoids full Retina GPU cost.
	handleResize();
}
