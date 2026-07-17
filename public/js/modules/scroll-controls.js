/**
 * Central home for this site's GSAP / ScrollTrigger-driven scroll effects.
 *
 * SplitType itself now comes from a CDN script (see layout.astro), matching
 * how GSAP/ScrollTrigger are already loaded, rather than reaching into
 * main.js's old private bundled copy.
 *
 * Requires GSAP + ScrollTrigger + SplitType (all loaded globally in
 * layout.astro).
 */

// ─── #page "active" state ────────────────────────────────────────────────
// #page can be pushed active by more than one independent condition (h1
// finishing its grow-scale, scroll depth, etc.) — track each by name and
// only drop the class once every condition is false again, so one
// condition reversing doesn't undo another that's still true.
const pageActiveConditions = {};
function setPageActiveCondition(name, isActive) {
	pageActiveConditions[name] = isActive;
	const page = document.querySelector("#page");
	if (!page) return;
	page.classList.toggle("active", Object.values(pageActiveConditions).some(Boolean));
}

// ─── Active section ─────────────────────────────────────────────────────
function initActiveSection() {
	document.querySelectorAll("section[id]").forEach((section) => {
		ScrollTrigger.create({
			trigger: section,
			start: "top top",
			end: "bottom top",
			toggleClass: { targets: section, className: "active" }
		});
	});
}

// ─── Text split reveal ──────────────────────────────────────────────────
function initTextSplit() {
	new SplitType("[text-split]", { types: "words, chars", tagName: "span" });

	function createScrollTrigger(triggerElement, timeline) {
		ScrollTrigger.create({
			trigger: triggerElement,
			start: "top top",
			end: "bottom top",
			onUpdate: (self) => {
				if (self.direction === -1) {
					timeline.reverse();
				} else {
					timeline.play();
				}
			}
		});
	}

	document.querySelectorAll("[words-slide-up]").forEach((element) => {
		const tl = gsap.timeline({ paused: true });
		tl.from(element.querySelectorAll(".word"), {
			opacity: 0,
			yPercent: 100,
			duration: 0.5,
			ease: "back.out(2)",
			stagger: { amount: 0.5 }
		});
		createScrollTrigger(element, tl);
	});

	document.querySelectorAll("[words-slide-from-right]").forEach((element) => {
		const tl = gsap.timeline({ paused: true });
		tl.from(element.querySelectorAll(".word"), {
			opacity: 0,
			x: 20,
			duration: 0.8,
			ease: "power2.out",
			stagger: { amount: 1.1 }
		});
		createScrollTrigger(element, tl);
	});
	
	document.querySelectorAll("[letters-slide-up]:not(#h1)").forEach((element) => {
		const tl = gsap.timeline({ paused: true });
		tl.from(element.querySelectorAll(".char"), {
			yPercent: 120,
			duration: 0.8,
			ease: "power1.out",
			stagger: { amount: 0.9 }
		});
		createScrollTrigger(element, tl);
	});

	gsap.set("[text-split]", { opacity: 1 });
}

// ─── Intro reveal (burst, spinning-text-container, h1 split text) ───────
// All three stay hidden until #intro's top reaches the top of the viewport,
// then reverse the instant it isn't flush with the top anymore (even 1px).
// main's padding-top: 150vh (_global.scss) already reserves scroll space for
// the hero's laptop animation before #intro begins, so #intro's own "top
// top" IS the 150vh mark (scrollAnimationHeight in laptop-3d.js) — no extra
// offset needed. A single ScrollTrigger point (onEnter / onLeaveBack),
// rather than a continuous direction check, since the trigger is this one
// specific scroll position, not "any time scrolling reverses".
//
// burst/spinning-text-container are plain GSAP tweens (matching the removed
// grow-burst/grow-half keyframe values), not CSS animations driven via the
// Web Animations API — that approach only ever played once and reversed
// sluggishly, because a CSS animation's own play-state fights repeated
// script-driven play()/reverse() calls. GSAP tweens handle repeat
// play/reverse cycles cleanly, and timeScale() lets the reverse run at a
// different (faster) speed than the load-in.
//
// Must run after initTextSplit() so #h1 has already been split into .char
// spans.
function initIntroReveal() {
	const burst = document.querySelector("#intro .h1-container .burst");
	const spinningText = document.querySelector("#intro .spinning-text-container");

	const growDuration = 1.2; // matches the old grow-burst/grow-half animation-duration
	const growEase = "back.out(1.7)"; // approximates cubic-bezier(0.34, 1.56, 0.64, 1)

	const growTweens = [];
	if (burst) {
		growTweens.push(
			gsap.fromTo(
				burst,
				{ rotate: 20, scale: 0 },
				{ rotate: -5, scale: 1, duration: growDuration, ease: growEase, paused: true }
			)
		);
	}
	if (spinningText) {
		growTweens.push(
			gsap.fromTo(
				spinningText,
				{ rotate: 90, scale: 0 },
				{ rotate: 0, scale: 0.5, duration: growDuration, ease: growEase, paused: true }
			)
		);
	}

	const h1 = document.querySelector("#h1");
	const h1Chars = h1 ? h1.querySelectorAll(".char") : null;
	const h1Timeline = h1Chars ? gsap.timeline({ paused: true }) : null;
	if (h1Timeline) {
		// Staggered reveal on the way in...
		h1Timeline.from(h1Chars, {
			yPercent: 120,
			duration: 0.8,
			ease: "power1.out",
			stagger: { amount: 0.9 }
		});
	}

	if (!growTweens.length && !h1Timeline) return;

	ScrollTrigger.create({
		trigger: "#intro",
		start: "top top",
		onEnter: () => {
			growTweens.forEach((tween) => tween.timeScale(1).play());
			if (h1Timeline) h1Timeline.play();
		},
		onLeaveBack: () => {
			growTweens.forEach((tween) => tween.timeScale(2).reverse());
			// ...but all letters disappear together on the way out, rather
			// than reversing the same stagger (which drags the last letter's
			// exit out well after the first). A separate, non-staggered tween
			// — not h1Timeline.reverse() — handles this; GSAP's auto-overwrite
			// takes control of the chars' yPercent away from the timeline, so
			// once it finishes, the timeline's own playhead is reset to 0
			// (an instant, invisible no-op since the chars are already at the
			// "from" state) so the next onEnter plays the staggered reveal
			// correctly again.
			if (h1Chars) {
				gsap.to(h1Chars, {
					yPercent: 120,
					duration: 0.4,
					ease: "power1.in",
					onComplete: () => h1Timeline.progress(0).pause()
				});
			}
		}
	});
}

// ─── Values section card reveal ─────────────────────────────────────────
// NOT CURRENTLY USED — section-Values.astro lives under UNUSED/ and isn't
// imported in index.astro, so #values-inner/.value-card never exist in the
// DOM. Uncomment this and its call in initScrollControls() once Values is
// back in the page.
/*
function initValuesReveal() {
	// Pins #values-inner and slides .value-card elements in from the right as
	// the user scrolls.
	const section = document.querySelector("#values-inner");
	const cards = document.querySelectorAll("#values .value-card");
	if (!section || !cards.length) return;

	// Cards start completely off-screen to the right (no opacity change) —
	// SVGs stay in place as backgrounds
	gsap.set(cards, { x: "100vw" });

	gsap.to(cards, {
		x: 0,
		ease: "power3.out",
		stagger: 0.33, // each card follows the previous
		scrollTrigger: {
			trigger: "#values-inner",
			pin: "#values-inner",
			start: "top top", // pin when section hits top of viewport
			end: "+=300%", // scroll budget: 3x viewport height for smooth stagger
			scrub: 1,
			anticipatePin: 1,
			markers: false // set to true for debugging
		}
	});
}
*/

// ─── Intro heading scale (laptop stage-2 growth window) ─────────────────
function initH1GrowScale() {
	const h1Container = document.querySelector("#intro .h1-container");
	if (!h1Container) return;

	const baseScale = 0.8; // matches _section.scss's default .h1-container transform
	const growScale = 1;

	window.addEventListener("laptop3d:growprogress", (e) => {
		const progress = e.detail;
		const scale = baseScale + progress * (growScale - baseScale);
		h1Container.style.transform = `scale(${scale})`;

		// #page gets "active" the instant .h1-container reaches scale(1) —
		// toggled off again if scrolled back before growth completes, so it
		// stays in sync rather than getting stuck on after one visit.
		setPageActiveCondition("h1Grown", progress >= 1);
	});
}

// ─── #page active past 400vh scrolled ───────────────────────────────────
function initPageActiveScrollDepth() {
	ScrollTrigger.create({
		start: () => window.innerHeight * 4, // 400vh, recalculated on resize
		onEnter: () => setPageActiveCondition("scrolledPast400vh", true),
		onLeaveBack: () => setPageActiveCondition("scrolledPast400vh", false)
	});
}

/**
 * Entry point — call once on DOMContentLoaded.
 */
export function initScrollControls() {
	if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") {
		console.warn("Scroll controls: GSAP or ScrollTrigger not loaded");
		return;
	}

	initActiveSection();
	initTextSplit();
	initIntroReveal();
	// initValuesReveal(); // uncomment once section-Values.astro is back in the page
	initH1GrowScale();
	initPageActiveScrollDepth();
}
