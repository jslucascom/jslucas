/**
 * 3D Laptop Animation Module
 * Only renders when visible and when values are changing
 */

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export function initLaptop3D() {
	// ===== DEVELOPMENT TOGGLE =====
	const ANIMATIONS_ENABLED = true; // 👈 Change to true when you need the 3D laptop
	// ==============================

	// Early exit if animations disabled
	if (!ANIMATIONS_ENABLED) {
		console.log('🎨 3D Laptop animation disabled for development');
		return;
	}

	const container = document.getElementById('laptop-3d-canvas-container');

	// Exit if container doesn't exist (not on this page)
	if (!container) return;

	console.log('Initializing OPTIMIZED 3D Laptop Animation...');

	// Get asset paths from data attributes
	const assetsPath = {
		models: container.dataset.modelsPath,
		textures: container.dataset.texturesPath
	};

	// ============================================
	// ANIMATION CONTROLS - EASY TO ADJUST
	// ============================================
	const animationControls = {
		// Scale animation (multiplier of base model size). Two stages:
		// startScale -> midScale plays alongside rotation/position over the
		// first `scrollAnimationHeight` vh of scroll (0-150vh by default).
		// midScale -> endScale is a second, scale-only stage that kicks in
		// once the page has scrolled `growScrollStart` vh (200vh by default)
		// and completes `growScrollHeight` vh later (350vh by default) — see
		// growTargetProgress in updateScroll().
		startScale: .65,
		midScale: 5,
		endScale: 14,

		// X-position animation (horizontal position)
		startX: -0.6,
		endX: 0,

		// Y-position animation (vertical position). Same two-stage pattern as
		// scale above: startY -> midY over the first scrollAnimationHeight vh,
		// midY -> endY over the growScrollStart/growScrollHeight window.
		startY: -0.5,
		midY: -5.5,
		endY: -17,

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

		// Scroll animation height
		scrollAnimationHeight: 150,

		// Stage-2 scale growth window (see startScale/midScale/endScale above)
		growScrollStart: 200,
		growScrollHeight: 150
	};

	// ============================================
	// LIGHTING CONTROLS
	// ============================================
	const lightingControls = {
		// Flat, directionless fill applied to every surface equally. Raising
		// this brightens the whole model at once — the broadest, blunter lever.
		ambientIntensity: 8,

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

		// Warm orange-tinted light from behind, creates a subtle edge/outline
		// highlight (rim light) that separates the laptop from the background.
		rimIntensity: 1.5,
		rimPosition: { x: 0, y: 3, z: -8 },

		// When true, backLight intensity is interpolated between
		// backLightStartIntensity (scroll top) and backLightEndIntensity
		// (scroll end) each frame, instead of staying at backIntensity.
		dynamicBackLight: true,
		backLightStartIntensity: 3,
		backLightEndIntensity: 2,

		// Catches the exterior lid as it rotates into view — without this the
		// lid/Apple-logo panel sits in near-total darkness, since none of the
		// other lights are aimed at the camera-facing side.
		lidIntensity: 9,
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
	// PERFORMANCE OPTIMIZATIONS
	// ============================================
	let isVisible = false;
	let isScrolling = false;
	let scrollTimeout;
	let animationFrameId = null;
	let isTabVisible = true;

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
	const scene = new THREE.Scene();
	scene.background = null;

	// Camera
	const camera = new THREE.PerspectiveCamera(
		45,
		baselineWidth / baselineHeight, // 16:9
		0.1,
		1000
	);
	camera.position.set(0, 2, 8);
	camera.lookAt(0, 0, 0);

	// Renderer with lower pixel ratio on mobile for better performance
	const isMobile = window.innerWidth < 768;
	const renderer = new THREE.WebGLRenderer({
		antialias: !isMobile, // Disable antialiasing on mobile
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

	let backLight = null;
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

	const rimLight = new THREE.DirectionalLight(0xff8844, lightingControls.rimIntensity);
	rimLight.position.set(
		lightingControls.rimPosition.x,
		lightingControls.rimPosition.y,
		lightingControls.rimPosition.z
	);
	scene.add(rimLight);

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

	// Model variables
	let laptop = null;
	let smoothProgress = 0;
	let targetProgress = 0;
	let growSmoothProgress = 0; // stage-2 scale growth (midScale -> endScale), see animationControls.growScrollStart
	let growTargetProgress = 0;
	let baseScale = 1;
	let viewportScaleFactor = 1; // NEW: Scale based on window width
	const textureLoader = new THREE.TextureLoader();

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

	// Texture filenames
	const textureFiles = {
		color: assetsPath.textures + '/lap-top-001-col-metalness-4k.png',
		normal: assetsPath.textures + '/lap-top-001-nrm-metalness-4k.png',
		roughness: assetsPath.textures + '/lap-top-001-roughness-metalness-4k.png',
		metalness: assetsPath.textures + '/lap-top-001-metalness-metalness-4k.png',
		ao: assetsPath.textures + '/lap-top-001-ao-metalness-4k.png'
	};

	// Load textures
	const textures = {
		color: null,
		normal: null,
		roughness: null,
		metalness: null,
		ao: null
	};

	console.log('Starting texture loading from:', assetsPath.textures);

	// Load all textures with error handling
	Promise.all([
		new Promise((resolve, reject) => {
			textureLoader.load(
				textureFiles.color,
				(texture) => {
					texture.colorSpace = THREE.SRGBColorSpace;
					textures.color = texture;
					console.log('✓ Color texture loaded');
					resolve();
				},
				undefined,
				(error) => {
					console.error('✗ Failed to load color texture:', error);
					reject(error);
				}
			);
		}),
		new Promise((resolve, reject) => {
			textureLoader.load(
				textureFiles.normal,
				(texture) => {
					textures.normal = texture;
					console.log('✓ Normal texture loaded');
					resolve();
				},
				undefined,
				(error) => {
					console.error('✗ Failed to load normal texture:', error);
					reject(error);
				}
			);
		}),
		new Promise((resolve, reject) => {
			textureLoader.load(
				textureFiles.roughness,
				(texture) => {
					textures.roughness = texture;
					console.log('✓ Roughness texture loaded');
					resolve();
				},
				undefined,
				(error) => {
					console.error('✗ Failed to load roughness texture:', error);
					reject(error);
				}
			);
		}),
		new Promise((resolve, reject) => {
			textureLoader.load(
				textureFiles.metalness,
				(texture) => {
					textures.metalness = texture;
					console.log('✓ Metalness texture loaded');
					resolve();
				},
				undefined,
				(error) => {
					console.error('✗ Failed to load metalness texture:', error);
					reject(error);
				}
			);
		}),
		new Promise((resolve, reject) => {
			textureLoader.load(
				textureFiles.ao,
				(texture) => {
					textures.ao = texture;
					console.log('✓ AO texture loaded');
					resolve();
				},
				undefined,
				(error) => {
					console.error('✗ Failed to load AO texture:', error);
					reject(error);
				}
			);
		})
	]).then(() => {
		console.log('✓ All textures loaded successfully');
		loadLaptopModel();
	}).catch((error) => {
		console.error('✗ Failed to load one or more textures:', error);
		showError(`Failed to load textures from ${assetsPath.textures}<br><br>Error: ${error.message || 'Unknown error'}`);
	});

	function loadLaptopModel() {
		const loader = new OBJLoader();
		console.log('Starting to load model from:', assetsPath.models + '/lap-top.obj');

		loader.load(
			assetsPath.models + '/lap-top.obj',
			(obj) => {
				console.log('✓ Model loaded successfully!');
				laptop = obj;

				const material = new THREE.MeshStandardMaterial({
					map: textures.color,
					normalMap: textures.normal,
					roughnessMap: textures.roughness,
					metalnessMap: textures.metalness,
					aoMap: textures.ao,
					metalness: 0.9,
					roughness: 0.3,
				});

				// Screen material — deliberately UNLIT. A real screen doesn't
				// reflect room light, it just displays at its own fixed
				// brightness. Using a lit material here meant every time the
				// lid/keyboard lights were brightened, the screen caught the
				// same boost as a specular hotspot, forcing you to compensate
				// by turning your actual laptop brightness down. MeshBasicMaterial
				// ignores scene lighting entirely, so this now always renders
				// at the texture's true brightness no matter what the rest of
				// the lighting is doing.
				const glassMaterial = new THREE.MeshBasicMaterial({
					map: textures.color,
				});

				laptop.traverse((child) => {
					if (child.isMesh) {
						child.material = child.name === 'glass' ? glassMaterial : material;
						child.castShadow = true;
						child.receiveShadow = true;
						child.geometry.computeVertexNormals();
						console.log('Applied material to mesh:', child.name);
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
				// shouldRender() won't fire on its own until the user scrolls
				// or the tab/visibility state changes, now that floating is off.
				// Run it through the same transform as the render loop so the
				// pose matches exactly (no snap on the first scroll frame).
				updateLaptopTransform();
				renderer.render(scene, camera);

				// Start render loop now that model is loaded
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
				console.error('✗ Error loading OBJ model:', error);
				showError(`Failed to load lap-top.obj file.<br><br>Expected location: ${assetsPath.models}/lap-top.obj<br><br>Error: ${error.message || 'Unknown error'}`);
			}
		);
	}

	// Easing functions
	function easeInOutCubic(t) {
		return t < 0.5 ?
			4 * t * t * t :
			1 - Math.pow(-2 * t + 2, 3) / 2;
	}

	function easeOutCubic(t) {
		return 1 - Math.pow(1 - t, 3);
	}

	function updateScroll() {
		const scrolled = window.scrollY;
		const animationHeightPx = (animationControls.scrollAnimationHeight / 100) * window.innerHeight;
		targetProgress = Math.min(scrolled / animationHeightPx, 1);

		// Stage-2 scale growth: 0 until growScrollStart vh, then ramps 0->1
		// linearly over the next growScrollHeight vh, clamped at 1 after that.
		const growStartPx = (animationControls.growScrollStart / 100) * window.innerHeight;
		const growHeightPx = (animationControls.growScrollHeight / 100) * window.innerHeight;
		growTargetProgress = Math.min(Math.max((scrolled - growStartPx) / growHeightPx, 0), 1);

		// Mark as scrolling
		isScrolling = true;
		clearTimeout(scrollTimeout);

		// Start render loop while scrolling
		startRenderLoop();

		// Stop rendering 100ms after scroll stops
		scrollTimeout = setTimeout(() => {
			isScrolling = false;
			// Only stop if floating is disabled OR both progress values are at a stable position
			if (
				!animationControls.floatingEnabled &&
				Math.abs(smoothProgress - targetProgress) < 0.001 &&
				Math.abs(growSmoothProgress - growTargetProgress) < 0.001
			) {
				stopRenderLoop();
			}
		}, 100);
	}

	// ============================================
	// OPTIMIZED RENDER LOOP - ONLY RUNS WHEN NEEDED
	// ============================================
	function shouldRender() {
		return isVisible && isTabVisible && laptop && (
			isScrolling ||
			animationControls.floatingEnabled ||
			Math.abs(smoothProgress - targetProgress) > 0.001 ||
			Math.abs(growSmoothProgress - growTargetProgress) > 0.001
		);
	}

	function startRenderLoop() {
		if (!animationFrameId && shouldRender()) {
			console.log('▶ Starting render loop');
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

	// Applies the scroll-driven transform for the current smoothProgress.
	// Shared by the render loop and the one-off initial render so both use
	// identical math — otherwise the laptop's pre-scroll pose (set directly
	// in loadLaptopModel) doesn't match where this function would place it,
	// causing a visible snap on the first scroll frame.
	function updateLaptopTransform() {
		const lerpFactor = 0.08;
		smoothProgress += (targetProgress - smoothProgress) * lerpFactor;
		growSmoothProgress += (growTargetProgress - growSmoothProgress) * lerpFactor;

		const easedProgress = easeInOutCubic(smoothProgress);
		const growEasedProgress = easeInOutCubic(growSmoothProgress);

		// Animate Y-axis rotation
		laptop.rotation.y = animationControls.startRotationY -
			(easedProgress * (animationControls.startRotationY - animationControls.endRotationY));

		// Animate X-axis rotation
		const xEasedProgress = easeOutCubic(smoothProgress);
		laptop.rotation.x = animationControls.startRotationX + (xEasedProgress * animationControls.endRotationX);

		// Animate scale — stage 1 (startScale -> midScale) tracks the main
		// scroll progress same as rotation/position; stage 2 (midScale ->
		// endScale) is added on top once growTargetProgress starts moving
		// (200vh+), so the laptop keeps growing well after rotation/position
		// have settled.
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
		// stage 1 (startY -> midY) tracks the main scroll progress, stage 2
		// (midY -> endY) continues via growEasedProgress once the 200vh+
		// growth window kicks in.
		const stage1Y = animationControls.startY +
			(easedProgress * (animationControls.midY - animationControls.startY));
		const baseY = stage1Y +
			(growEasedProgress * (animationControls.endY - animationControls.midY));

		// Add floating animation on top if enabled — fades out as the scroll
		// animation reaches its end, so the laptop settles instead of jumping.
		let floatingOffset = 0;
		if (animationControls.floatingEnabled) {
			const floatingFade = 1 - smoothProgress;
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

		// Broadcast the stage-2 growth progress (same eased, lerp-smoothed
		// value driving the laptop's own scale/position above) so other
		// elements — e.g. section#intro .h1-container in scroll-controls.js —
		// can move in exact lockstep with the laptop, frame for frame, rather
		// than approximating it with a separately-timed CSS animation.
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

	// Scroll listener
	window.addEventListener('scroll', updateScroll);

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

	// Initial scroll calculation
	updateScroll();
}