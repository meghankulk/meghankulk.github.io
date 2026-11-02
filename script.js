const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Hero reroute: traffic tangles through weather, then settles into calm lanes ----------
const SVG_NS = "http://www.w3.org/2000/svg";

// Calm lanes: [startY, laneY over the cell, cell-crossing x, endY]. Uneven on purpose, like real flows.
const LANES = [
  [170, 112, 380, 150],
  [214, 146, 410, 205],
  [262, 188, 432, 268],
  [404, 458, 390, 420],
  [452, 502, 420, 470],
];
// The weather cell can be dragged; lanes keep their offsets from wherever it sits
const HOME = { x: 405, y: 320 };
const cell = { ...HOME }, cellTarget = { ...HOME };
// Each route is two cubic segments: [x0 y0, c1, c2, mid, c3, c4, end]
const calmRoute = ([sy, my, mx, ey], c = HOME) => {
  const y = my + c.y - HOME.y, x = mx + c.x - HOME.x;
  return [40, sy, 190, sy, x - 140, y, x, y, x + 140, y, 620, ey, 760, ey];
};
const CALM = LANES.map((l) => calmRoute(l));
// A flight given a waypoint bends its route through that point instead
// (handles shrink near the edges so the curve never doubles back)
const routeThrough = ([sy, , , ey], w) => {
  const inH = Math.min(140, (w.x - 40) * 0.5), outH = Math.min(140, (760 - w.x) * 0.5);
  const c1 = Math.min(190, 40 + (w.x - 40) * 0.4), c4 = Math.max(620, 760 - (760 - w.x) * 0.4);
  return [40, sy, c1, sy, w.x - inH, w.y, w.x, w.y, w.x + outH, w.y, c4, ey, 760, ey];
};
const TANGLED = [
  [220, 140, 300, 470, 380, 430, 470, 390, 560, 120],
  [160, 330, 280, 90, 420, 170, 520, 250, 610, 520],
  [210, 420, 330, 500, 440, 470, 560, 440, 580, 90],
  [190, 300, 290, 130, 360, 160, 450, 190, 640, 560],
  [230, 520, 260, 200, 430, 120, 590, 60, 600, 470],
].map((mid, i) => [...CALM[i].slice(0, 2), ...mid, ...CALM[i].slice(12)]);
const toD = (a) =>
  `M${a[0]} ${a[1]} C${a[2]} ${a[3]}, ${a[4]} ${a[5]}, ${a[6]} ${a[7]} C${a[8]} ${a[9]}, ${a[10]} ${a[11]}, ${a[12]} ${a[13]}`;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// Story timing (ms): everything starts tangled, resolves, then every CYCLE two lanes
// get pushed back into the weather and calmly rerouted again.
const FIRST_HOLD = 1800, RESOLVE = 3600, CYCLE = 20000, CALM_UNTIL = 9000;
const DISRUPT = 2600, HOLD = 1400, DEPTH = 0.65; // how far a disrupted lane falls back toward tangled

// A clicked plane falls back into the weather, holds, then reroutes calmly
function kicked(u) {
  if (u < DISRUPT) return 1 - DEPTH * ease(u / DISRUPT);
  if (u < DISRUPT + HOLD) return 1 - DEPTH;
  return 1 - DEPTH + DEPTH * ease(clamp01((u - DISRUPT - HOLD) / RESOLVE));
}
const KICK_LENGTH = DISRUPT + HOLD + RESOLVE;

function laneCalm(i, t) {
  const f = flights[i];
  if (f.kick != null && t - f.kick < KICK_LENGTH) return kicked(t - f.kick);
  if (t < FIRST_HOLD + RESOLVE) return ease(clamp01((t - FIRST_HOLD) / RESOLVE));
  const local = t - CALM_UNTIL;
  if (local < 0) return 1;
  const k = Math.floor(local / CYCLE) + 1;
  if (i !== k % 5 && i !== (k + 2) % 5) return 1;
  return kicked(local % CYCLE);
}

// Flights without a permanent tag still get a data block when hovered
const SPARE_CALLSIGNS = ["MK118", "MK307", "MK461"];
const ALTITUDES = ["FL350", "FL330", "FL370", "FL310", "FL290"];
let spare = 0;
const flights = [...document.querySelectorAll(".flight")].map((el, i) => {
  const callsign = el.dataset.callsign || SPARE_CALLSIGNS[spare++];
  const tag = document.createElementNS(SVG_NS, "text");
  tag.setAttribute("class", "callsign");
  tag.textContent = callsign;
  el.appendChild(tag);
  // a wide, invisible copy of the route that's easy to hover and click
  const hit = document.createElementNS(SVG_NS, "path");
  hit.setAttribute("class", "route-hit");
  el.insertBefore(hit, el.firstChild);
  return {
    el, hit, callsign, altitude: ALTITUDES[i],
    base: el.querySelector(".route-base"),
    trail: el.querySelector(".route-trail"),
    plane: el.querySelector(".plane"),
    tag,
    alwaysTag: !!el.dataset.callsign,
    from: TANGLED[i],
    to: CALM[i],
    duration: +el.dataset.duration,
    delay: +el.dataset.delay,
    tail: +el.dataset.tail,
    scale: +el.dataset.scale,
  };
});

function shape(f, m) {
  const d = toD(f.from.map((v, k) => v + (f.to[k] - v) * m));
  f.base.setAttribute("d", d);
  f.trail.setAttribute("d", d);
  f.hit.setAttribute("d", d);
  f.len = f.trail.getTotalLength();
}

function place(f, t) {
  const s = t * f.len;
  const p = f.trail.getPointAtLength(s);
  const q = f.trail.getPointAtLength(Math.min(s + 1, f.len));
  const angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  f.plane.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${angle}) scale(${f.scale})`);
  f.trail.style.strokeDasharray = `${f.tail} ${f.len * 2}`;
  f.trail.style.strokeDashoffset = f.tail - s;
  // fade in at departure, out on arrival
  const fade = Math.min(1, t * 5, (1 - t) * 5);
  f.plane.style.opacity = fade;
  f.trail.style.opacity = fade;
  // near the right edge the tag sits on the plane's left so it stays in view
  const flip = p.x > 640;
  f.tag.setAttribute("x", flip ? p.x - 12 : p.x + 12);
  f.tag.setAttribute("text-anchor", flip ? "end" : "start");
  f.tag.setAttribute("y", p.y - 12);
  f.tag.style.opacity = f.alwaysTag || f.focused ? fade : 0;
}


// Weather: lumpy radar-style contours that slowly reshape and drift
const wx = ["outer", "mid", "core"].map((n) => document.querySelector(`.wx-${n}`));
const CONTOURS = [
  { dx: 0, dy: 0, r: 92, seed: 0.4 },
  { dx: -8, dy: 6, r: 60, seed: 2.1 },
  { dx: -16, dy: 10, r: 31, seed: 4.7 },
];

function blob(cx, cy, r, seed, t) {
  const pts = [];
  for (let j = 0; j < 36; j++) {
    const a = (j / 36) * Math.PI * 2;
    const k =
      1 +
      0.11 * Math.sin(2 * a + seed + t * 0.00011) +
      0.07 * Math.sin(3 * a + seed * 1.7 - t * 0.00008) +
      0.05 * Math.sin(5 * a + seed * 2.3 + t * 0.00015);
    pts.push([cx + r * k * Math.cos(a) * 1.18, cy + r * k * Math.sin(a)]);
  }
  // closed Catmull-Rom spline through the points
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let j = 0; j < pts.length; j++) {
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((o) => pts[(j + o + pts.length) % pts.length]);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + "Z";
}

function weather(t) {
  const cx = cell.x + 12 * Math.sin(t * 0.00016);
  const cy = cell.y + 6 * Math.sin(t * 0.00011 + 1);
  CONTOURS.forEach((c, i) => wx[i].setAttribute("d", blob(cx + c.dx, cy + c.dy, c.r, c.seed, t)));
}

if (reduceMotion) {
  weather(0);
  flights.forEach((f, i) => {
    shape(f, 1);
    place(f, 0.35 + i * 0.1);
  });
} else {
  const start = performance.now();
  let clock = 0;
  const frame = (now) => {
    const t = (clock = now - start);
    // the cell glides toward wherever it was dragged
    const dx = cellTarget.x - cell.x, dy = cellTarget.y - cell.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.1) { cell.x += dx * 0.12; cell.y += dy * 0.12; }
    weather(t);
    flights.forEach((f, i) => {
      const m = laneCalm(i, t);
      // each route eases toward its lane around the cell, or through its waypoint
      const target = f.wp ? routeThrough(LANES[i], f.wp) : calmRoute(LANES[i], cell);
      let moving = false;
      f.to = f.to.map((v, k) => {
        const d = target[k] - v;
        if (Math.abs(d) > 0.05) { moving = true; return v + d * 0.12; }
        return target[k];
      });
      if (moving || f.m !== m) shape(f, (f.m = m));
      if (f.kick != null) f.tag.textContent = t - f.kick < KICK_LENGTH ? `${f.callsign} · REROUTING` : `${f.callsign} · ${f.altitude}`;
      // planes keep flying throughout; each loops with a pause between trips
      place(f, Math.min(1, ((t + f.delay) % (f.duration * 1.3)) / f.duration));
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---------- Interactive airspace ----------
  const skySvg = document.querySelector(".sky");
  const toSky = (e) => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(skySvg.getScreenCTM().inverse());
    return { x: pt.x, y: pt.y };
  };

  // Hover a plane to bring it forward with its data block; click to send it
  // back into the weather and watch it reroute
  flights.forEach((f) => {
    f.el.addEventListener("pointerenter", () => {
      f.focused = true;
      f.tag.textContent = `${f.callsign} · ${f.altitude}`;
      f.el.classList.add("is-focus");
      skySvg.classList.add("has-focus");
    });
    f.el.addEventListener("pointerleave", () => {
      f.focused = false;
      if (f.alwaysTag) f.tag.textContent = f.callsign;
      f.el.classList.remove("is-focus");
      skySvg.classList.remove("has-focus");
    });
    f.el.addEventListener("click", () => {
      if (f.kick == null || clock - f.kick > KICK_LENGTH) f.kick = clock;
    });
  });

  // Drag the weather cell anywhere; every lane reroutes around it
  const wxGroup = document.querySelector(".wx");
  const hint = document.createElementNS(SVG_NS, "text");
  hint.setAttribute("class", "wx-hint");
  hint.textContent = "Drag the weather · click to add a waypoint";
  // The hint shows once: on a visitor's first arrival, until they first move
  // over the sky. After that it stays gone, on later visits too.
  let hintSeen = false;
  try { hintSeen = localStorage.getItem("wxHintSeen") === "1"; } catch (e) {}
  if (hintSeen) hint.classList.add("gone");
  wxGroup.appendChild(hint);
  // It hides once the pointer actually travels across the sky, not on a pointer that is
  // merely resting there: after the passcode screen, the cursor already sits over the sky
  let travelled = 0, last = null;
  const watchTravel = (e) => {
    if (last) travelled += Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    if (travelled < 60) return;
    hint.classList.add("gone");
    try { localStorage.setItem("wxHintSeen", "1"); } catch (e) {}
    skySvg.removeEventListener("pointermove", watchTravel);
  };
  skySvg.addEventListener("pointermove", watchTravel);
  skySvg.addEventListener("pointerleave", () => { last = null; });

  // Click open sky to drop a waypoint: the nearest flight reroutes through it.
  // Click a waypoint to remove it and send that flight back to its lane.
  const sea = document.createElementNS(SVG_NS, "rect");
  sea.setAttribute("class", "sky-hit");
  sea.setAttribute("width", "800");
  sea.setAttribute("height", "640");
  skySvg.insertBefore(sea, skySvg.firstChild);
  const fixLayer = document.createElementNS(SVG_NS, "g");
  skySvg.insertBefore(fixLayer, wxGroup.nextSibling);
  const nearestFlight = (p) => {
    let best = null, bestD = Infinity;
    flights.forEach((f) => {
      for (let s = 0; s <= 40; s++) {
        const q = f.trail.getPointAtLength((s / 40) * f.len);
        const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        if (d < bestD) { bestD = d; best = f; }
      }
    });
    return best;
  };
  const clearWaypoint = (f) => { if (f.wp) { f.wp.mark.remove(); f.wp = null; } };

  // Before you click: a ghost waypoint follows the cursor, naming the flight
  // it will reroute, and that flight's route lights up
  const ghost = document.createElementNS(SVG_NS, "g");
  ghost.setAttribute("class", "fix-ghost");
  ghost.innerHTML = `<path d="M0 -6 L6 0 L0 6 L-6 0 Z"/><text x="10" y="-9"></text>`;
  fixLayer.appendChild(ghost);
  const ghostLabel = ghost.querySelector("text");
  let target = null, pending = null;
  const setTarget = (f) => {
    if (target === f) return;
    if (target) target.el.classList.remove("is-target");
    target = f;
    if (f) f.el.classList.add("is-target");
  };
  sea.addEventListener("pointermove", (e) => {
    const p = toSky(e);
    ghost.setAttribute("transform", `translate(${p.x} ${p.y})`);
    ghost.classList.add("on");
    if (pending) return;   // look up the nearest flight at most once a frame
    pending = requestAnimationFrame(() => {
      pending = null;
      const f = nearestFlight(p);
      setTarget(f);
      ghostLabel.textContent = `+ WAYPOINT · ${f.callsign}`;
    });
  });
  sea.addEventListener("pointerleave", () => { ghost.classList.remove("on"); setTarget(null); });

  sea.addEventListener("click", (e) => {
    const p = toSky(e);
    const f = nearestFlight(p);
    clearWaypoint(f);
    const mark = document.createElementNS(SVG_NS, "g");
    mark.setAttribute("class", "user-fix");
    mark.setAttribute("transform", `translate(${p.x} ${p.y})`);
    mark.innerHTML = `<circle r="12" class="user-fix-hit"/><circle r="6" class="fix-pulse"/><path d="M0 -6 L6 0 L0 6 L-6 0 Z"/><text x="10" y="-9" class="fix-name">${f.callsign}</text><text x="10" y="-9" class="fix-remove">REMOVE</text>`;
    mark.addEventListener("click", (ev) => { ev.stopPropagation(); clearWaypoint(f); });
    fixLayer.appendChild(mark);
    f.wp = { x: p.x, y: p.y, mark };
    ghost.classList.remove("on");
    hint.classList.add("gone");
  });
  let grab = null;
  wxGroup.addEventListener("pointerdown", (e) => {
    const p = toSky(e);
    grab = { dx: cellTarget.x - p.x, dy: cellTarget.y - p.y };
    wxGroup.setPointerCapture(e.pointerId);
    skySvg.classList.add("dragging");
    hint.classList.add("gone");
    e.preventDefault();
  });
  wxGroup.addEventListener("pointermove", (e) => {
    if (!grab) return;
    const p = toSky(e);
    // keep every lane inside the picture
    cellTarget.x = Math.min(560, Math.max(250, p.x + grab.dx));
    cellTarget.y = Math.min(418, Math.max(248, p.y + grab.dy));
  });
  const drop = () => { grab = null; skySvg.classList.remove("dragging"); };
  wxGroup.addEventListener("pointerup", drop);
  wxGroup.addEventListener("pointercancel", drop);
  // below the lowest lane, clear of the routes and their tags
  hint.setAttribute("x", 400);
  hint.setAttribute("y", 600);
}

// ---------- Subtle parallax on the hero art ----------
const sky = document.querySelector(".sky");
if (!reduceMotion && window.matchMedia("(pointer: fine)").matches) {
  window.addEventListener("pointermove", (e) => {
    const x = (e.clientX / innerWidth - 0.5) * 6;
    const y = (e.clientY / innerHeight - 0.5) * 6;
    sky.style.transform = `translate(${x}px, ${y}px)`;
  });
  sky.style.transition = "transform 1.6s cubic-bezier(.2,.7,.2,1)";
}

// ---------- Scroll progress plane ----------
const progress = document.querySelector(".flight-progress");
const progressPlane = document.querySelector(".progress-plane");
const progressGlyph = progressPlane.querySelector("use");
let lastScroll = scrollY;
function updateProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const ratio = max > 0 ? scrollY / max : 0;
  const travel = progress.clientHeight - progressPlane.clientHeight;
  progressPlane.style.transform = `translateY(${ratio * travel}px)`;
  // Nose points the way you're scrolling: down the page, or back up it
  if (scrollY !== lastScroll) progressGlyph.classList.toggle("climbing", scrollY < lastScroll);
  lastScroll = scrollY;
}
addEventListener("scroll", updateProgress, { passive: true });
addEventListener("resize", updateProgress);
updateProgress();
