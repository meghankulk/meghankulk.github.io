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
