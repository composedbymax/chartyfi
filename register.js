if ("serviceWorker" in navigator) {
  const isInChartyfi = window.location.pathname.startsWith("/chartyfi");
  if (isInChartyfi) {
    window.addEventListener("load", async () => {
      try {
        const reg = await navigator.serviceWorker.register("/chartyfi/sw.js", {
          scope: "/chartyfi/"
        });
        const isFresh = !reg.active;
        if (!isFresh) {
          let hasReloaded = false;
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            if (hasReloaded || !navigator.serviceWorker.controller) return;
            hasReloaded = true;
            window.location.reload();
          });
        }
        reg.update();
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && !isFresh) {
              console.log("New update installed, activating ...");
            }
          });
        });
        const sw = reg.active || reg.waiting || reg.installing;
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (isFresh) {console.log("Welcome");}
          else {console.log(`App registered: ${event.data.version}`);}
        };
        sw?.postMessage({ type: "GET_VERSION" }, [channel.port2]);
      } catch (err) {
        console.error("App registration failed:", err);
      }
    });
  }
}