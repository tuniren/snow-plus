"use strict";
importScripts("shared.js");

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-focus") return;
  try {
    const settings = await SnowPlus.read();
    await SnowPlus.update({ enabled: !settings.enabled });
  } catch (error) {
    console.error("Snow Plus could not save the preference.", error);
  }
});
