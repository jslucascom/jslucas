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
const pageActiveConditions = {};
function setPageActiveCondition(name, isActive) {
	pageActiveConditions[name] = isActive;
	const page = document.querySelector("#page");
	if (!page) return;

	const wasActive = page.classList.contains("active");
	const nowActive = Object.values(pageActiveConditions).some(Boolean);
	page.classList.toggle("active", nowActive);

	// Lets other init*() functions (e.g. initIntroColumnsReveal) react to
	// #page gaining/losing "active" without each needing its own polling
	// or MutationObserver.
	if (nowActive !== wasActive) {
		page.dispatchEvent(new CustomEvent("page:activechange", { detail: nowActive }));
	}
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

// ─── Intro stat columns reveal (each column rises up, staggered) ────────
//
// Triggered by #page gaining "active" (see setPageActiveCondition) rather
// than each column's own scroll position, since all 4 columns sit
// side-by-side and would otherwise reveal at ~the same scroll depth anyway.
// Whole columns start hidden and rise up one-by-one, .2s apart. The
// heading/paragraph split-text inside each column still gets its own
// letter-by-letter reveal, triggered separately as it becomes visible (see
// the generic [letters-slide-up] handling above in initTextSplit).
function initIntroColumnsReveal() {
	const row = document.querySelector("[data-intro-columns]");
	const page = document.querySelector("#page");
	if (!row || !page) return;

	const columns = row.querySelectorAll(".col");
	if (!columns.length) return;

	const master = gsap.timeline({ paused: true });
	master.from(columns, {
		opacity: 0,
		y: 40,
		duration: 0.6,
		ease: "power1.out",
		stagger: 0.2 // each column rises up .2s after the previous one
	});

	page.addEventListener("page:activechange", (e) => {
		if (e.detail) {
			master.play();
		} else {
			master.reverse();
		}
	});
}

// ─── Intro reveal (burst, spinning-text-container, h1 split text) ───────
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
		start: () => window.innerHeight * 1.4, // 140vh, recalculated on resize
		onEnter: () => {
			growTweens.forEach((tween) => tween.timeScale(1).play());
			if (h1Timeline) h1Timeline.play();
		},
		onLeaveBack: () => {
			growTweens.forEach((tween) => tween.timeScale(2).reverse());
			if (h1Chars) {
				gsap.to(h1Chars, {
					yPercent: 120,
					duration: 0.2,
					ease: "power1.in",
					onComplete: () => h1Timeline.progress(0).pause()
				});
			}
		}
	});
}

// ─── Intro heading scale (laptop stage-2 growth window) ─────────────────
function initH1GrowScale() {
	const h1Container = document.querySelector("#intro .h1-container");
	const spinningText = document.querySelector("#intro .spinning-text-container");
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

		// Same reasoning as above: toggled (not just added) so it stays in
		// sync if the user scrolls back to before growth starts.
		if (spinningText) spinningText.classList.toggle("goodbye", progress > 0);
	});
}

// ─── #page active past 400vh scrolled ───────────────────────────────────
function initPageActiveScrollDepth() {
	ScrollTrigger.create({
		start: () => window.innerHeight * 3.4, // 340vh, recalculated on resize
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
	initIntroColumnsReveal();
	initIntroReveal();
	initH1GrowScale();
	initPageActiveScrollDepth();
}
