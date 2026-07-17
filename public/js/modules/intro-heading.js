/*
 * NEUMORPHISM TYPO
 * Made with ThreeJS - Enjoy!
 *
 * Experimenting with neumorphism in typography.
 * Use cursor to move around the shiny effect.
 * On mobile touch + drag screen.
 *
 * #034 - #100DaysOfCode
 * By ilithya | 2020
 * https://www.ilithya.rocks/
 * https://twitter.com/ilithya_rocks
 *
 * Adapted from the original CodePen to run as an ES module bootstrapped
 * from an Astro component, matching the laptop-3d.js integration pattern.
 */

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// Pre-outlined artwork: "Ready to    expand your / online    presence?" set
// in the site's own fonts (ZT Nature, with "expand" in RL Madena) and
// exported as flat vector paths — no live font/glyph conversion needed,
// SVGLoader just extrudes whatever paths are in the file.
const TYPO_SVG_URL = '/jslucas/fonts/three/ready-to-expand.svg';

export function initIntroHeading() {
	const container = document.querySelector('#intro-heading-canvas-container');
	if (!container) return;

	const colorBg = 'hotpink'; // #ff69b4
	const colorTypo = '#EDE9DE'; // dark pink

	const nearDist = 0.1;
	const farDist = 10000;

	const getSize = () => ({
		width: container.clientWidth || window.innerWidth,
		height: container.clientHeight || window.innerHeight,
	});

	let { width, height } = getSize();

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(75, width / height, nearDist, farDist);
	camera.position.z = Math.round(farDist / 20);

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setClearColor(colorBg, 0);
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(width, height);
	container.appendChild(renderer.domElement);

	const light = new THREE.DirectionalLight(0xffdffd, 1.8);
	light.position.set(-15, 0, 70);
	scene.add(light);

	// Converts a screen-pixel distance to world units at the text's depth
	// (z=0), based on the camera's current field of view and distance —
	// recalculated on resize so it stays accurate at any viewport size.
	const pxToWorldY = (px) => {
		const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
		return (px / height) * visibleHeight;
	};
	const verticalOffsetPx = 100;

	// Visible width in world units at the text's depth (z=0) — depends on
	// the camera's aspect ratio, which tracks the container's actual pixel
	// size (see getSize()/handleResize below). Since the container is
	// styled at 90vw, this shrinks and grows right along with it.
	const getVisibleWidth = () => {
		const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
		return visibleHeight * camera.aspect;
	};

	// CREATE TYPOGRAPHY
	const group = new THREE.Group();
	group.position.y = pxToWorldY(verticalOffsetPx);

	// How much of the canvas' visible width the text should fill — the one
	// size knob (equivalent to the old typoSize), expressed as a fraction of
	// the container instead of a fixed size so it scales with the canvas.
	const targetFillFraction = 0.85;
	let svgGroup = null;
	let svgNaturalWidth = 0;

	const updateSvgScale = () => {
		if (!svgGroup || !svgNaturalWidth) return;
		const scale = (getVisibleWidth() * targetFillFraction) / svgNaturalWidth;
		// SVG y-axis points down; flip it to match the scene's y-up convention.
		svgGroup.scale.set(scale, -scale, scale);
	};

	const svgLoader = new SVGLoader();
	svgLoader.load(
		TYPO_SVG_URL,
		(result) => {
			const material = new THREE.MeshStandardMaterial({
				color: colorBg,
				emissive: colorTypo,
				roughness: 0.3,
				metalness: 1,
				transparent: true,
				opacity: 0.8,
			});

			svgGroup = new THREE.Group();
			for (const path of result.paths) {
				const shapes = SVGLoader.createShapes(path);
				for (const shape of shapes) {
					const geometry = new THREE.ExtrudeGeometry(shape, {
						depth: 0,
						bevelEnabled: false,
						curveSegments: 12,
					});
					svgGroup.add(new THREE.Mesh(geometry, material));
				}
			}

			// Centre by baking the offset into each mesh's own geometry (rather
			// than svgGroup.position), so it's unaffected by the scale/flip
			// applied to svgGroup by updateSvgScale().
			const box = new THREE.Box3().setFromObject(svgGroup);
			const center = box.getCenter(new THREE.Vector3());
			svgGroup.children.forEach((mesh) => mesh.geometry.translate(-center.x, -center.y, -center.z));
			svgNaturalWidth = box.max.x - box.min.x;

			updateSvgScale();
			group.add(svgGroup);
		},
		undefined,
		(err) => console.error('[intro-heading] SVG failed to load', err)
	);

	scene.add(group);

	camera.lookAt(scene.position);

	// MOUSE/TOUCH TILT EFFECT — a subtle tilt-card style effect (like the
	// classic CSS `rotateX/rotateY` hover card): the pointer position is
	// normalized to -1..1 across the container and mapped to a small rotation,
	// maxTilt degrees at most. Only tracks the pointer while it's actually
	// over the canvas' bounds. The container has pointer-events:none (so it
	// doesn't block clicks on the hero), so hover is detected by comparing
	// coordinates against getBoundingClientRect() rather than relying on
	// enter/leave events on the container itself.
	const maxTilt = THREE.MathUtils.degToRad(8);
	let targetRotX = 0;
	let targetRotY = 0;

	const mouseFX = {
		isInside(cX, cY) {
			const rect = container.getBoundingClientRect();
			return cX >= rect.left && cX <= rect.right && cY >= rect.top && cY <= rect.bottom;
		},
		setTarget(cX, cY) {
			const rect = container.getBoundingClientRect();
			const nx = (cX - rect.left - rect.width / 2) / (rect.width / 2); // -1..1
			const ny = (cY - rect.top - rect.height / 2) / (rect.height / 2); // -1..1
			targetRotY = -nx * maxTilt;
			targetRotX = ny * maxTilt;
		},
		onMouseMove(e) {
			if (mouseFX.isInside(e.clientX, e.clientY)) {
				mouseFX.setTarget(e.clientX, e.clientY);
			} else {
				targetRotX = 0;
				targetRotY = 0;
			}
		},
		onTouchMove(e) {
			const touch = e.changedTouches[0];
			if (mouseFX.isInside(touch.clientX, touch.clientY)) {
				mouseFX.setTarget(touch.clientX, touch.clientY);
			} else {
				targetRotX = 0;
				targetRotY = 0;
			}
		},
	};

	document.addEventListener('mousemove', mouseFX.onMouseMove);
	document.addEventListener('touchmove', mouseFX.onTouchMove);

	// RESIZE
	const handleResize = () => {
		({ width, height } = getSize());
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
		group.position.y = pxToWorldY(verticalOffsetPx);
		updateSvgScale();
	};
	window.addEventListener('resize', handleResize);

	// RENDERING
	// The group's rotation eases toward the target every frame. When the
	// pointer leaves the canvas the target resets to 0, so it glides back to
	// rest through the same lerp — no freeze, no snap-back jerk, and no
	// motion at all while the cursor isn't over it.
	const render = () => {
		const ct = 0.08;
		group.rotation.x += (targetRotX - group.rotation.x) * ct;
		group.rotation.y += (targetRotY - group.rotation.y) * ct;

		renderer.render(scene, camera);

		requestAnimationFrame(render);
	};
	render();
}
