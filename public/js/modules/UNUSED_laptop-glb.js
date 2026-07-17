/**
 * 3D Laptop GLB Animation Module — simple version
 * Loads the GLB in its natural open state. No lid animation.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function initLaptop3DGLB() {

	const container = document.getElementById('laptop-3d-canvas-container');
	if (!container) return;

	console.log('Initialising GLB Laptop...');

	const modelsPath = container.dataset.modelsPath;

	// ============================================
	// SCROLL / SCENE ANIMATION CONTROLS
	// ============================================
	const animationControls = {
		startScale: 0.8,
		endScale: 5,
		startX: -0.15,
		endX: 0,
		startY: -0.5,
		endY: -5,
		startRotationY: Math.PI * -1.24,
		endRotationY: 0,
		startRotationX: 0.1,
		endRotationX: -0.5,
		floatingEnabled: true,
		floatingAmount: 0.15,
		floatingSpeed: 0.0005,
		scrollAnimationHeight: 100
	};

	const lightingControls = {
		ambientIntensity: 2,
		mainIntensity: 1,
		mainPosition: { x: 5, y: 10, z: 7 },
		backLightEnabled: true,
		backPosition: { x: 0, y: 5, z: -10 },
		fillIntensity: 1,
		fillPosition: { x: -5, y: 5, z: -5 },
		rimIntensity: 1,
		rimPosition: { x: 0, y: 3, z: -8 },
		dynamicBackLight: true,
		backLightStartIntensity: 2,
		backLightEndIntensity: 0
	};

	const baselineWidth  = 1512;
	const baselineHeight = 857;

	// ============================================
	// PERFORMANCE FLAGS
	// ============================================
	let isVisible        = false;
	let isScrolling      = false;
	let scrollTimeout;
	let animationFrameId = null;
	let isTabVisible     = true;

	// ============================================
	// ERROR HELPER
	// ============================================
	function showError(message) {
		const errorDiv   = document.getElementById('laptop-3d-error-message');
		const loadingDiv = document.getElementById('laptop-3d-loading');
		if (loadingDiv) loadingDiv.style.display = 'none';
		if (errorDiv) {
			errorDiv.style.display = 'block';
			errorDiv.textContent   = message;
		}
	}

	// ============================================
	// SCENE / CAMERA / RENDERER
	// ============================================
	const scene = new THREE.Scene();
	scene.background = null;

	const camera = new THREE.PerspectiveCamera(45, baselineWidth / baselineHeight, 0.1, 1000);
	camera.position.set(0, 2, 8);
	camera.lookAt(0, 0, 0);

	const isMobile = window.innerWidth < 768;
	const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
	renderer.setSize(baselineWidth, baselineHeight);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
	renderer.shadowMap.enabled   = true;
	renderer.shadowMap.type      = THREE.PCFSoftShadowMap;
	renderer.toneMapping         = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.2;
	container.appendChild(renderer.domElement);

	// ============================================
	// ENVIRONMENT MAP (reflections)
	// ============================================
	const pmrem = new THREE.PMREMGenerator(renderer);
	pmrem.compileEquirectangularShader();
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

	// ============================================
	// LIGHTING
	// ============================================
	scene.add(new THREE.AmbientLight(0xffffff, lightingControls.ambientIntensity));

	const mainLight = new THREE.DirectionalLight(0xffffff, lightingControls.mainIntensity);
	mainLight.position.set(lightingControls.mainPosition.x, lightingControls.mainPosition.y, lightingControls.mainPosition.z);
	mainLight.castShadow = true;
	mainLight.shadow.mapSize.set(2048, 2048);
	mainLight.shadow.camera.near = 0.5;
	mainLight.shadow.camera.far  = 50;
	mainLight.shadow.radius = 8;
	mainLight.shadow.bias   = -0.0001;
	scene.add(mainLight);

	let backLight = null;
	if (lightingControls.backLightEnabled) {
		backLight = new THREE.DirectionalLight(0xffffff, lightingControls.backLightStartIntensity);
		backLight.position.set(lightingControls.backPosition.x, lightingControls.backPosition.y, lightingControls.backPosition.z);
		scene.add(backLight);
	}

	const fillLight = new THREE.DirectionalLight(0x4477ff, lightingControls.fillIntensity);
	fillLight.position.set(lightingControls.fillPosition.x, lightingControls.fillPosition.y, lightingControls.fillPosition.z);
	scene.add(fillLight);

	const rimLight = new THREE.DirectionalLight(0xff8844, lightingControls.rimIntensity);
	rimLight.position.set(lightingControls.rimPosition.x, lightingControls.rimPosition.y, lightingControls.rimPosition.z);
	scene.add(rimLight);

	const lidLight = new THREE.DirectionalLight(0xffffff, 3);
	lidLight.position.set(0, 3, 10);
	scene.add(lidLight);

	// ============================================
	// MODEL
	// ============================================
	let laptop    = null;
	let baseScale = 1;
	let smoothProgress = 0;
	let targetProgress = 0;

	// Lid open animation state
	const LID_OPEN_ANGLE   = -1.5; // ~72° open
	const LID_OPEN_DURATION = 2000; // ms
	let lidStartTime  = null;
	let lidAnimDone   = false;

	const loader = new GLTFLoader();
	loader.load(
		modelsPath + '/UNUSED_macbook_pro_13_inch_2020.glb',
		(gltf) => {
			console.log('✓ GLB loaded');
			laptop = gltf.scene;

			// Enhance materials for better reflections
			laptop.traverse((child) => {
				if (!child.isMesh || !child.material) return;
				child.castShadow    = true;
				child.receiveShadow = true;
				child.material      = child.material.clone();
				const m = child.material;
				if (m.name === 'Space_Grey' || m.name === 'Space_Grey.001') {
					m.metalness = 0.85; m.roughness = 0.25; m.envMapIntensity = 1.2;
				} else if (m.name === 'Black_Glass') {
					m.metalness = 0.1;  m.roughness = 0.05; m.envMapIntensity = 1.5;
				} else if (m.name === 'Glass') {
					m.metalness = 0.0;  m.roughness = 0.0;  m.envMapIntensity = 2.0;
					m.transparent = true; m.opacity = 0.6;
				} else if (m.name === 'Black_Plastic') {
					m.metalness = 0.1;  m.roughness = 0.4;
				}
			});

			// Centre and scale
			const box    = new THREE.Box3().setFromObject(laptop);
			const center = box.getCenter(new THREE.Vector3());
			const size   = box.getSize(new THREE.Vector3());
			baseScale    = 3 / Math.max(size.x, size.y, size.z);

			laptop.scale.setScalar(baseScale * animationControls.startScale);
			laptop.position.sub(center.multiplyScalar(baseScale * animationControls.startScale));
			laptop.position.y = animationControls.startY;
			laptop.rotation.y = animationControls.startRotationY;
			laptop.rotation.x = animationControls.startRotationX;

			scene.add(laptop);

			// Start the lid closed — the render loop will animate it open.
			const bevels2 = laptop.getObjectByName('Bevels_2');
			if (bevels2) {
				bevels2.rotation.x = 0;
				lidStartTime = performance.now();
				console.log('✓ Lid animation starting...');
			} else {
				console.warn('Bevels_2 node not found — lid will remain as-is');
				lidAnimDone = true;
			}

			console.log('✓ Model added to scene');

			const loadingDiv = document.getElementById('laptop-3d-loading');
			if (loadingDiv) loadingDiv.style.display = 'none';

			startRenderLoop();
		},
		(xhr) => {
			const pct = xhr.total > 0 ? Math.round((xhr.loaded / xhr.total) * 100) : 0;
			const loadingDiv = document.getElementById('laptop-3d-loading');
			if (loadingDiv) loadingDiv.textContent = `Loading: ${pct}%`;
		},
		(error) => {
			console.error('GLB load error:', error);
			showError('Failed to load 3D model.');
		}
	);

	// ============================================
	// EASING
	// ============================================
	function easeInOutCubic(t) {
		return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
	}
	function easeOutCubic(t) {
		return 1 - Math.pow(1 - t, 3);
	}

	// ============================================
	// SCROLL
	// ============================================
	function updateScroll() {
		const animHeightPx = (animationControls.scrollAnimationHeight / 100) * window.innerHeight;
		targetProgress = Math.min(window.scrollY / animHeightPx, 1);
	}

	// ============================================
	// RENDER LOOP — runs continuously while visible
	// ============================================
	function startRenderLoop() {
		if (!animationFrameId && laptop && isVisible && isTabVisible) animate();
	}

	function stopRenderLoop() {
		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	function animate() {
		if (!laptop || !isVisible || !isTabVisible) { stopRenderLoop(); return; }
		animationFrameId = requestAnimationFrame(animate);

		smoothProgress += (targetProgress - smoothProgress) * 0.08;
		const ep  = easeInOutCubic(smoothProgress);
		const xep = easeOutCubic(smoothProgress);

		// Lid open tween (runs once on load)
		if (!lidAnimDone && lidStartTime !== null) {
			const bevels2 = laptop.getObjectByName('Bevels_2');
			if (bevels2) {
				const elapsed = performance.now() - lidStartTime;
				const t = Math.min(elapsed / LID_OPEN_DURATION, 1);
				const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
				bevels2.rotation.x = eased * LID_OPEN_ANGLE;
				if (t >= 1) {
					lidAnimDone = true;
					console.log(`✓ Lid open at ${(LID_OPEN_ANGLE * 180 / Math.PI).toFixed(1)}°`);
				}
			}
		}

		laptop.rotation.y = animationControls.startRotationY -
			(ep * (animationControls.startRotationY - animationControls.endRotationY));
		laptop.rotation.x = animationControls.startRotationX + (xep * animationControls.endRotationX);

		const scaleMult = animationControls.startScale + (ep * (animationControls.endScale - animationControls.startScale));
		laptop.scale.setScalar(baseScale * scaleMult);

		laptop.position.x = animationControls.startX + (ep * (animationControls.endX - animationControls.startX));

		const baseY = animationControls.startY + (ep * (animationControls.endY - animationControls.startY));
		let floatOffset = 0;
		if (animationControls.floatingEnabled) {
			const t = Date.now() * animationControls.floatingSpeed;
			floatOffset = Math.sin(t) * animationControls.floatingAmount +
				Math.sin(t * 0.5) * (animationControls.floatingAmount * 0.6);
		}
		laptop.position.y = baseY + floatOffset;

		if (backLight && lightingControls.dynamicBackLight) {
			backLight.intensity = lightingControls.backLightStartIntensity -
				(ep * (lightingControls.backLightStartIntensity - lightingControls.backLightEndIntensity));
		}

		renderer.render(scene, camera);
	}

	// ============================================
	// VISIBILITY
	// ============================================
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			isVisible = entry.isIntersecting;
			if (isVisible) startRenderLoop();
			else           stopRenderLoop();
		});
	}, { threshold: 0.1 });
	observer.observe(container);

	document.addEventListener('visibilitychange', () => {
		isTabVisible = !document.hidden;
		if (isTabVisible && isVisible) startRenderLoop();
		else                           stopRenderLoop();
	});

	// ============================================
	// SCROLL + RESIZE
	// ============================================
	window.addEventListener('scroll', updateScroll);

	function handleResize() {
		renderer.setSize(baselineWidth, baselineHeight);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1 : 2));
		const scale = Math.min(window.innerWidth / baselineWidth, window.innerHeight / baselineHeight);
		renderer.domElement.style.transform       = `scale(${scale})`;
		renderer.domElement.style.transformOrigin = 'left center';
		camera.aspect = baselineWidth / baselineHeight;
		camera.updateProjectionMatrix();
		if (laptop && isVisible && isTabVisible) renderer.render(scene, camera);
	}

	window.addEventListener('resize', handleResize);
	handleResize();
	updateScroll();
}
