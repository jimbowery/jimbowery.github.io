/*
	Image viewer: click an image in the page content to open it full screen,
	then pan and zoom it.

	Mouse:    wheel to zoom, drag to pan, double-click to zoom in / reset.
	Touch:    pinch to zoom, drag to pan, double-tap to zoom in / reset.
	Keyboard: + / - to zoom, 0 to reset, arrows to pan, Esc to close.
*/
(function() {

	var MIN_SCALE = 1, MAX_SCALE = 10;

	var selector = '#main img';
	var exclude = '.tiles img, a img, .no-zoom, .no-zoom img';

	var overlay, stage, img, hint;
	var scale = 1, x = 0, y = 0;
	var pointers = {}, lastPan = null, lastPinch = null, lastTap = 0;
	var lastFocus = null;

	function build() {
		overlay = document.createElement('div');
		overlay.className = 'image-viewer';
		overlay.setAttribute('role', 'dialog');
		overlay.setAttribute('aria-modal', 'true');
		overlay.setAttribute('aria-label', 'Image viewer');
		overlay.tabIndex = -1;

		stage = document.createElement('div');
		stage.className = 'image-viewer-stage';

		img = document.createElement('img');
		img.alt = '';
		img.draggable = false;
		stage.appendChild(img);

		var controls = document.createElement('div');
		controls.className = 'image-viewer-controls';
		controls.appendChild(button('+', 'Zoom in', function() { zoomBy(1.5); }));
		controls.appendChild(button('−', 'Zoom out', function() { zoomBy(1 / 1.5); }));
		controls.appendChild(button('1:1', 'Reset zoom', reset));
		controls.appendChild(button('×', 'Close', close));

		hint = document.createElement('div');
		hint.className = 'image-viewer-hint';
		hint.textContent = 'Scroll or pinch to zoom · drag to pan · Esc to close';

		overlay.appendChild(stage);
		overlay.appendChild(controls);
		overlay.appendChild(hint);
		document.body.appendChild(overlay);

		stage.addEventListener('wheel', onWheel, { passive: false });
		stage.addEventListener('pointerdown', onPointerDown);
		stage.addEventListener('pointermove', onPointerMove);
		stage.addEventListener('pointerup', onPointerUp);
		stage.addEventListener('pointercancel', onPointerUp);
		stage.addEventListener('dblclick', function(e) { toggleZoom(e.clientX, e.clientY); });
		overlay.addEventListener('keydown', onKey);
	}

	function button(label, title, action) {
		var b = document.createElement('button');
		b.type = 'button';
		b.textContent = label;
		b.title = title;
		b.setAttribute('aria-label', title);
		b.addEventListener('click', function(e) { e.stopPropagation(); action(); });
		return b;
	}

	function open(src, alt) {
		if (!overlay) build();
		lastFocus = document.activeElement;
		img.src = src;
		img.alt = alt || '';
		reset();
		overlay.classList.add('visible');
		document.documentElement.classList.add('image-viewer-open');
		hint.classList.remove('hidden');
		setTimeout(function() { hint.classList.add('hidden'); }, 2500);
		overlay.focus();
	}

	function close() {
		overlay.classList.remove('visible');
		document.documentElement.classList.remove('image-viewer-open');
		pointers = {}; lastPan = null; lastPinch = null;
		if (lastFocus && lastFocus.focus) lastFocus.focus();
	}

	function reset() {
		scale = 1; x = 0; y = 0;
		apply();
	}

	// Keep the image from being dragged entirely out of view.
	function clamp() {
		var w = img.offsetWidth * scale, h = img.offsetHeight * scale;
		var maxX = Math.max(0, (w - stage.clientWidth) / 2);
		var maxY = Math.max(0, (h - stage.clientHeight) / 2);
		x = Math.min(maxX, Math.max(-maxX, x));
		y = Math.min(maxY, Math.max(-maxY, y));
	}

	function apply() {
		clamp();
		img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
		stage.classList.toggle('zoomed', scale > 1);
	}

	// Zoom by factor, keeping the point under (cx, cy) fixed on screen.
	function zoomAt(factor, cx, cy) {
		var next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
		var rect = stage.getBoundingClientRect();
		var px = cx - rect.left - rect.width / 2;
		var py = cy - rect.top - rect.height / 2;
		var k = next / scale;
		x = px - (px - x) * k;
		y = py - (py - y) * k;
		scale = next;
		apply();
	}

	function zoomBy(factor) {
		var rect = stage.getBoundingClientRect();
		zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
	}

	function toggleZoom(cx, cy) {
		if (scale > 1) reset();
		else zoomAt(2.5, cx, cy);
	}

	function onWheel(e) {
		e.preventDefault();
		zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002)), e.clientX, e.clientY);
	}

	function pinchState() {
		var p = Object.keys(pointers).map(function(k) { return pointers[k]; });
		return {
			dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
			cx: (p[0].x + p[1].x) / 2,
			cy: (p[0].y + p[1].y) / 2
		};
	}

	function onPointerDown(e) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		stage.setPointerCapture(e.pointerId);
		pointers[e.pointerId] = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
		var n = Object.keys(pointers).length;
		if (n === 1) lastPan = { x: e.clientX, y: e.clientY };
		else if (n === 2) { lastPan = null; lastPinch = pinchState(); }
	}

	function onPointerMove(e) {
		var p = pointers[e.pointerId];
		if (!p) return;
		p.x = e.clientX; p.y = e.clientY;

		if (lastPinch && Object.keys(pointers).length === 2) {
			var s = pinchState();
			x += s.cx - lastPinch.cx;
			y += s.cy - lastPinch.cy;
			zoomAt(s.dist / lastPinch.dist, s.cx, s.cy);
			lastPinch = s;
		} else if (lastPan) {
			x += e.clientX - lastPan.x;
			y += e.clientY - lastPan.y;
			lastPan = { x: e.clientX, y: e.clientY };
			apply();
		}
	}

	function onPointerUp(e) {
		var p = pointers[e.pointerId];
		if (!p) return;
		delete pointers[e.pointerId];
		var remaining = Object.keys(pointers);

		if (remaining.length === 1) {
			lastPinch = null;
			var q = pointers[remaining[0]];
			lastPan = { x: q.x, y: q.y };
			return;
		}
		if (remaining.length > 0) return;

		lastPan = null; lastPinch = null;

		// A tap (no real movement): close on backdrop, double-tap to zoom on touch.
		var moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 6;
		if (moved || e.type === 'pointercancel') return;

		if (e.pointerType !== 'mouse') {
			var now = Date.now();
			if (now - lastTap < 300) { lastTap = 0; toggleZoom(e.clientX, e.clientY); return; }
			lastTap = now;
		}
		if (e.target === stage && scale === 1) close();
	}

	function onKey(e) {
		var step = 60;
		switch (e.key) {
			case 'Escape': close(); break;
			case '+': case '=': zoomBy(1.5); break;
			case '-': case '_': zoomBy(1 / 1.5); break;
			case '0': reset(); break;
			case 'ArrowLeft': x += step; apply(); break;
			case 'ArrowRight': x -= step; apply(); break;
			case 'ArrowUp': y += step; apply(); break;
			case 'ArrowDown': y -= step; apply(); break;
			default: return;
		}
		e.preventDefault();
	}

	function init() {
		var images = document.querySelectorAll(selector);
		Array.prototype.forEach.call(images, function(el) {
			if (el.matches(exclude)) return;
			el.classList.add('image-viewer-zoomable');
			el.tabIndex = 0;
			el.setAttribute('role', 'button');
			el.setAttribute('aria-label', (el.alt ? el.alt + ' — ' : '') + 'open image viewer');
			el.addEventListener('click', function() { open(el.currentSrc || el.src, el.alt); });
			el.addEventListener('keydown', function(e) {
				if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(el.currentSrc || el.src, el.alt); }
			});
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();

})();
