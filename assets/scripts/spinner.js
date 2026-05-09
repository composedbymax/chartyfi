export function attachSpinner(parent, options = {}) {
  const spinner = document.createElement("div");
  spinner.classList.add("spinner");
  const dots = 12;
  const radius = 16;
  for (let i = 0; i < dots; i++) {
    const dot = document.createElement("div");
    const angle = (i / dots) * Math.PI * 2;
    dot.style.transform =`translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
    dot.style.animationDelay = `${i * 0.1}s`;
    spinner.appendChild(dot);
  }
  const wrapper = document.createElement("div");
  wrapper.classList.add("spinner-wrapper");
  wrapper.appendChild(spinner);
  parent.appendChild(wrapper);
  function apply(opts = {}) {
    if (opts.size) {spinner.style.width = opts.size + "px";spinner.style.height = opts.size + "px";}
    if (opts.color) {spinner.style.setProperty("--spinner-color", opts.color);}
  }
  apply(options);
  return {el: wrapper,
    show() {wrapper.style.display = "flex";},
    hide() {wrapper.style.display = "none";},
    set(newOptions = {}) {apply(newOptions);return this;},
    destroy() {wrapper.remove();}
  };
}