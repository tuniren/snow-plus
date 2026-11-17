"use strict";
const enableButton = document.querySelector("#demo-enable");
const syncDemo = settings => { enableButton.hidden = settings.enabled; };
SnowPlus.read().then(syncDemo);
SnowPlus.subscribe(syncDemo);
enableButton.addEventListener("click", () => SnowPlus.update({ enabled: true }));
document.querySelector("#demo-login").addEventListener("click", () => document.querySelector("#demo-dialog").showModal());
document.querySelector("#demo-feed").addEventListener("click", event => {
  if (event.target.matches("[data-like]")) {
    const liked = event.target.getAttribute("aria-pressed") === "true";
    const count = Number(event.target.textContent.match(/\d+/)[0]);
    event.target.setAttribute("aria-pressed", String(!liked));
    event.target.textContent = `${liked ? "♡" : "♥"} ${count + (liked ? -1 : 1)}`;
  }
  if (event.target.matches("[data-comments]")) document.querySelector("#demo-dialog").showModal();
});
document.querySelector("#demo-load").addEventListener("click", () => {
  const row = document.querySelector(".style_timeline__item_3WW").cloneNode(true);
  row.querySelector(".style_timeline__item__title_3bq a").textContent = "新加载的讨论也会自动应用样式";
  row.querySelector(".style_date-and-source_3r-").textContent = "刚刚";
  document.querySelector("#demo-feed").append(row);
});
document.querySelectorAll("[data-feed]").forEach(tab => {
  tab.addEventListener("click", event => {
    event.preventDefault();
    document.querySelectorAll("[data-feed]").forEach(link => link.classList.toggle("style_active_1Qc", link === tab));
    const feed = document.querySelector("#demo-feed");
    [...feed.children].forEach((row, index) => {
      row.hidden = (tab.dataset.feed === "following" && index % 2 === 1)
        || (tab.dataset.feed === "news" && index % 2 === 0);
    });
    if (tab.dataset.feed === "latest") feed.prepend(feed.lastElementChild);
  });
});
