"use strict";
const controls = [...document.querySelectorAll("[data-setting]")];
const status = document.querySelector("#status");

function render(settings) {
  controls.forEach(control => {
    control.checked = settings[control.dataset.setting];
    control.disabled = control.dataset.setting !== "enabled" && !settings.enabled;
  });
  document.querySelector("#mode-description").textContent = settings.enabled
    ? "GitHub 风格界面已启用" : "当前显示雪球原始界面";
}

controls.forEach(control => {
  control.disabled = true;
  control.addEventListener("change", async () => {
    try {
      render(await SnowPlus.update({ [control.dataset.setting]: control.checked }));
      status.textContent = "已保存，已打开的雪球页面会同步更新";
      status.classList.remove("error");
    } catch {
      status.textContent = "保存失败，请重新打开扩展后重试";
      status.classList.add("error");
      try { render(await SnowPlus.read()); } catch { /* Keep the save error visible. */ }
    }
  });
});
SnowPlus.read().then(settings => {
  render(settings);
  status.textContent = "设置自动保存，并随 Chrome 同步";
}).catch(() => {
  status.textContent = "无法读取设置，请重新打开扩展后重试";
  status.classList.add("error");
});
SnowPlus.subscribe(render);
