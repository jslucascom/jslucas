/**
 * Scroll Indicator for Existing Navigation
 * Works with .navbar > .nav-link structure
 */

class NavScrollIndicator {
    constructor() {
        this.nav = document.querySelector('.navbar');
        this.links = document.querySelectorAll('.navbar .nav-link');
        this.sections = document.querySelectorAll('[data-section]');
        this.marker = document.querySelector('.position-marker');

        if (!this.nav || this.links.length === 0 || this.sections.length === 0) {
            console.warn('Navigation or sections not found');
            return;
        }

        this.init();
    }

    init() {
        gsap.registerPlugin(ScrollTrigger);

        // Section detection — each section fires when its top
        // crosses the centre of the viewport, regardless of height.
        // The next section's trigger naturally takes over.
        this.sections.forEach((section, i) => {
            const sectionId = section.getAttribute('data-section') || section.id;
            const nextSection = this.sections[i + 1];

            ScrollTrigger.create({
                trigger: section,
                start: 'top center',
                // End when the NEXT section's top hits centre,
                // or bottom of page for the last section.
                endTrigger: nextSection || section,
                end: nextSection ? 'top center' : 'bottom bottom',
                onEnter: () => this.setActiveById(sectionId),
                onEnterBack: () => this.setActiveById(sectionId)
            });
        });
    }

    setActiveById(sectionId) {
        // Remove active from all links
        this.links.forEach(link => link.classList.remove('active'));

        // Update the navbar class to reflect the current section
        this.nav.className = 'navbar ' + sectionId;

        // Find and activate the matching link
        let activeLink = null;
        this.links.forEach((link) => {
            const href = link.getAttribute('href');
            if (href === `#${sectionId}` || href === sectionId) {
                activeLink = link;
            }
        });

        if (activeLink) {
            activeLink.classList.add('active');

            // Trigger the SVG morph animation
            const target = activeLink.getAttribute('data-target');
            if (target) {
                const animId = 'animateTo' + target.charAt(0).toUpperCase() + target.slice(1);
                const animEl = document.getElementById(animId);
                if (animEl) {
                    animEl.beginElement();
                }
            }

            // Animate the position marker if it exists
            if (this.marker) {
                const newIndex = Array.from(this.links).indexOf(activeLink);
                const currentIndex = this._currentIndex || 0;
                const distance = Math.abs(newIndex - currentIndex);

                if (distance > 0) {
                    this.marker.animate([
                        { transform: 'scale(1)' },
                        { transform: `scale(1, ${distance + 1})` },
                        { transform: 'scale(1)' }
                    ], {
                        duration: 800,
                        easing: 'cubic-bezier(0.5, 0, 0.75, 0)'
                    });
                }

                this._currentIndex = newIndex;
            }
        }
    }
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new NavScrollIndicator();
    });
} else {
    new NavScrollIndicator();
}
