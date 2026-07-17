/**
 * Central home for this site's GSAP / ScrollTrigger-driven scroll effects.
 *
 * SplitType itself now comes from a CDN script (see layout.astro), matching
 * how GSAP/ScrollTrigger are already loaded, rather than reaching into
 * main.js's old private bundled copy.
 *
 * Requires GSAP + ScrollTrigger + SplitType (all loaded globally in
 * layout.astro).
 *
 * This module also owns every scroll-trigger "when"/"how long" setting for
 * the 3D laptop (public/js/modules/laptop-3d.js) — trigger depth, stage
 * duration, reveal lead time. laptop-3d.js itself has no scroll-reading
 * logic any more; it just plays whatever target it's told to via
 * setLaptopSpinTarget()/setLaptopGrowTarget() (see initLaptopSpin()/
 * initLaptopGrow() below).
 */

import { setLaptopSpinTarget, setLaptopGrowTarget } from "/jslucas/js/modules/laptop-3d.js";

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

// ─── Laptop spin (startY -> midY / startScale -> midScale) ──────────────
const laptopSpinDurationMs = 1600; // full 0->1 traverse
const laptopSpinRevealLeadMs = 300; // initIntroReveal plays this long before the spin visually concludes — see initIntroReveal()
const laptopSpinCloseDelayMs = 800; // how long the laptop stays visibly open once scrolled back to the top before it actually starts closing — matches how long initIntroReveal's reverse takes to play out (burst/spinningText: 1.2s at timeScale(2) = 0.6s, which outlasts the 0.2s h1Chars reverse), so the text finishes clearing away first, then the laptop starts visibly closing behind it. Update this together with initIntroReveal()'s growDuration/timeScale if either changes.

let laptopSpinRevealFired = false; // guards against re-dispatching "laptop:spinreveal" while sitting at the top of the spin, and against dispatching "laptop:spinreverse" when the reveal never actually played
let laptopSpinRevealTimeoutId = null; // pending "fire the reveal" timer
let laptopSpinCloseTimeoutId = null; // pending "start closing" timer

function initLaptopSpin() {
	ScrollTrigger.create({
		start: 0,
		onEnter: () => {
			// Scrolling back down cancels any pending delayed close below
			// and reopens right away — the delay only applies on the way
			// out (onLeaveBack), not the way in.
			if (laptopSpinCloseTimeoutId) {
				clearTimeout(laptopSpinCloseTimeoutId);
				laptopSpinCloseTimeoutId = null;
			}

			setLaptopSpinTarget(1, laptopSpinDurationMs);

			if (!laptopSpinRevealFired && !laptopSpinRevealTimeoutId) {
				laptopSpinRevealTimeoutId = setTimeout(() => {
					laptopSpinRevealTimeoutId = null;
					laptopSpinRevealFired = true;
					window.dispatchEvent(new CustomEvent("laptop:spinreveal"));
				}, Math.max(laptopSpinDurationMs - laptopSpinRevealLeadMs, 0));
			}
		},
		onLeaveBack: () => {
			if (laptopSpinCloseTimeoutId) return; // already closing

			if (laptopSpinRevealTimeoutId) {
				clearTimeout(laptopSpinRevealTimeoutId);
				laptopSpinRevealTimeoutId = null;
			}

			if (laptopSpinRevealFired) {
				// The reveal had already played — undo it immediately, but
				// hold the laptop itself open for laptopSpinCloseDelayMs so
				// the text finishes clearing away before the laptop starts
				// visibly closing behind it, rather than both moving at once.
				laptopSpinRevealFired = false;
				window.dispatchEvent(new CustomEvent("laptop:spinreverse"));
				laptopSpinCloseTimeoutId = setTimeout(() => {
					laptopSpinCloseTimeoutId = null;
					setLaptopSpinTarget(0, laptopSpinDurationMs);
				}, laptopSpinCloseDelayMs);
			} else {
				// Reveal never played (scrolled back up before the spin
				// finished) — nothing to wait on, close right away.
				setLaptopSpinTarget(0, laptopSpinDurationMs);
			}
		}
	});
}

// ─── Intro reveal (burst, spinning-text-container, h1 split text) ───────
function initIntroReveal() {
	const burst = document.querySelector("#intro .burst");
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
		h1Timeline.from(h1Chars, {
			yPercent: 120,
			duration: 0.8,
			ease: "power1.out",
			stagger: { amount: 0.9 }
		});
	}

	if (!growTweens.length && !h1Timeline) return;

	window.addEventListener("laptop:spinreveal", () => {
		growTweens.forEach((tween) => tween.timeScale(1).play());
		if (h1Timeline) h1Timeline.play();
	});

	// Runs at 2x speed on the way back so the text clears out promptly
	// rather than lingering while the laptop starts closing.
	window.addEventListener("laptop:spinreverse", () => {
		growTweens.forEach((tween) => tween.timeScale(2).reverse());
		if (h1Chars) {
			gsap.to(h1Chars, {
				yPercent: 120,
				duration: 0.2,
				ease: "power1.in",
				onComplete: () => {
					if (h1Timeline) h1Timeline.progress(0).pause();
				}
			});
		}
	});
}

// ─── Laptop grow (midY -> endY / midScale -> endScale) ──────────────────
const laptopGrowDurationMs = 1200;
const laptopGrowRevealLeadMs = 700; // laptop:growreveal fires this long before the grow stage visually concludes — see initPageActiveScrollDepth()

let laptopGrowRevealTimeoutId = null; // pending "fire the reveal" timer

function initLaptopGrow() {
	ScrollTrigger.create({
		start: () => window.innerHeight * 1, // 100vh, recalculated on resize
		onEnter: () => {
			setLaptopGrowTarget(1, laptopGrowDurationMs);

			if (laptopGrowRevealTimeoutId) clearTimeout(laptopGrowRevealTimeoutId);
			laptopGrowRevealTimeoutId = setTimeout(() => {
				laptopGrowRevealTimeoutId = null;
				window.dispatchEvent(new CustomEvent("laptop:growreveal"));
			}, Math.max(laptopGrowDurationMs - laptopGrowRevealLeadMs, 0));
		},
		onLeaveBack: () => {
			setLaptopGrowTarget(0, laptopGrowDurationMs);

			if (laptopGrowRevealTimeoutId) {
				clearTimeout(laptopGrowRevealTimeoutId);
				laptopGrowRevealTimeoutId = null;
			}
			window.dispatchEvent(new CustomEvent("laptop:growreverse"));
		}
	});
}

// ─── #page active — flips just before the laptop grow stage concludes ───
const pageActiveConditions = {};
function setPageActiveCondition(name, isActive) {
	pageActiveConditions[name] = isActive;
	const page = document.querySelector("#page");
	if (!page) return;

	const wasActive = page.classList.contains("active");
	const nowActive = Object.values(pageActiveConditions).some(Boolean);
	page.classList.toggle("active", nowActive);

	// Lets other init*() functions react to #page gaining/losing "active"
	// without each needing its own polling or MutationObserver.
	if (nowActive !== wasActive) {
		page.dispatchEvent(new CustomEvent("page:activechange", { detail: nowActive }));
	}
}
// Driven by initLaptopGrow() above, not by scroll position directly — same
// pattern as initIntroReveal() listening to initLaptopSpin()'s events:
//   - laptop:growreveal fires laptopGrowRevealLeadMs before the grow stage
//     visually concludes.
//   - laptop:growreverse fires the moment the grow stage reverses.
function initPageActiveScrollDepth() {
	window.addEventListener("laptop:growreveal", () => setPageActiveCondition("scrolledPastGrow", true));
	window.addEventListener("laptop:growreverse", () => setPageActiveCondition("scrolledPastGrow", false));
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
	initLaptopSpin();
	initIntroReveal();
	initLaptopGrow();
	initPageActiveScrollDepth();
}
