// Back to work: if the visitor came from the home page, go back in history so they land where they left off
(() => {
  const back = document.querySelector(".back");
  if (!back || !document.referrer) return;
  const from = new URL(document.referrer);
  if (from.origin !== location.origin || !["/", "/index.html"].includes(from.pathname) || history.length < 2) return;
  back.addEventListener("click", (e) => { e.preventDefault(); history.back(); });
})();

// Case study screenshots open full size: click any image to read it, click again or press Esc to close
(() => {
  const images = document.querySelectorAll(".case-figure img, .compare img");
  if (!images.length) return;
  const viewer = document.createElement("dialog");
  viewer.className = "viewer";
  viewer.innerHTML = '<img alt=""><button class="viewer-close" type="button" aria-label="Close">×</button>';
  document.body.append(viewer);
  const full = viewer.querySelector("img");
  images.forEach((img) => {
    img.classList.add("zoomable");
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    const open = () => {
      full.src = img.currentSrc || img.src;
      full.alt = img.alt;
      viewer.showModal();
    };
    img.addEventListener("click", open);
    img.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
  });
  viewer.addEventListener("click", () => viewer.close());
})();
