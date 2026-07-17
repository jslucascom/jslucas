/**
 * Central home for this site's GSAP / ScrollTrigger-driven scroll effects.
 * Owns every "when"/"how long" setting for the 3D laptop's spin stage (laptop-3d.js has none of its own) via setLaptopSpinTarget().
 */

import { setLaptopSpinTarget } from "/jslucas/js/modules/laptop-3d.js";

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

// ─── Laptop spin (startY -> endY / startScale -> endScale) ──────────────
const laptopSpinDurationMs = 1600; // full 0->1 traverse
const laptopSpinRevealLeadMs = 300; // initIntroReveal plays this long before the spin visually concludes
const laptopSpinCloseDelayMs = 800; // delay before the laptop visibly closes after scrolling back up, so text clears first

let laptopSpinRevealFired = false; // guards duplicate spinreveal/spinreverse dispatches
let laptopSpinRevealTimeoutId = null; // pending "fire the reveal" timer
let laptopSpinCloseTimeoutId = null; // pending "start closing" timer

function initLaptopSpin() {
	ScrollTrigger.create({
		start: 0,
		onEnter: () => {
			// Scrolling back down cancels any pending delayed close and reopens right away.
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
				// Undo the reveal immediately, but hold the laptop open briefly so text clears first.
				laptopSpinRevealFired = false;
				window.dispatchEvent(new CustomEvent("laptop:spinreverse"));
				laptopSpinCloseTimeoutId = setTimeout(() => {
					laptopSpinCloseTimeoutId = null;
					setLaptopSpinTarget(0, laptopSpinDurationMs);
				}, laptopSpinCloseDelayMs);
			} else {
				// Reveal never played — nothing to wait on, close right away.
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

	// Runs at 2x speed on the way back so text clears before the laptop starts closing.
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

// ─── Laptop grow (CSS scale tween, not the 3D model) ─────────────────────
// Plain GSAP scale tween on the canvas container + intro wrapper, timed to match the old WebGL grow stage.
const laptopGrowDurationSecs = 1.2;
const laptopGrowEase = "power4.in"; // ~ old easeInQuint (cubic-bezier(0.64, 0, 0.78, 0))

function initLaptopGrow() {
	const laptop = document.querySelector("#laptop-3d-canvas-inner");
	const intro = document.querySelector("#intro .sticky-inner");

	const growTweens = [];
	if (laptop) {
		growTweens.push(
			gsap.fromTo(
				laptop,
				{ scale: 1 },
				{ scale: 1.5, duration: laptopGrowDurationSecs, ease: laptopGrowEase, paused: true }
			)
		);
	}
	if (intro) {
		growTweens.push(
			gsap.fromTo(
				intro,
				{ scale: .8 },
				{ scale: 1, duration: 1, ease: laptopGrowEase, paused: true }
			)
		);
	}

	ScrollTrigger.create({
		start: () => window.innerHeight * 1, // 100vh, recalculated on resize
		onEnter: () => {
			// Reveal fires once every tween is actually done, not on a lead-time guess. Reset per onEnter — no stacking.
			let completedCount = 0;
			growTweens.forEach((tween) => {
				tween.eventCallback("onComplete", () => {
					completedCount += 1;
					if (completedCount === growTweens.length) {
						window.dispatchEvent(new CustomEvent("laptop:growreveal"));
					}
				});
				tween.play();
			});
		},
		onLeaveBack: () => {
			growTweens.forEach((tween) => {
				tween.eventCallback("onComplete", null); // clear, else a stale callback double-fires next onEnter
				tween.reverse();
			});
			window.dispatchEvent(new CustomEvent("laptop:growreverse"));
		}
	});
}

// ─── #page active ─────────────────────────────────────────────────────
const pageActiveConditions = {};
function setPageActiveCondition(name, isActive) {
	pageActiveConditions[name] = isActive;
	const page = document.querySelector("#page");
	if (!page) return;

	const wasActive = page.classList.contains("active");
	const nowActive = Object.values(pageActiveConditions).some(Boolean);
	page.classList.toggle("active", nowActive);

	// Lets other init*() functions react without their own polling/MutationObserver.
	if (nowActive !== wasActive) {
		page.dispatchEvent(new CustomEvent("page:activechange", { detail: nowActive }));
	}
}

// Listens for initLaptopGrow()'s events. #page gains "active" once the grow animation has actually finished, not before.
function initPageActive() {
	window.addEventListener("laptop:growreveal", () => setPageActiveCondition("scrolledPastGrow", true));
	window.addEventListener("laptop:growreverse", () => setPageActiveCondition("scrolledPastGrow", false));
}

// Entry point — call once on DOMContentLoaded.
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
	initPageActive();
}
