/* YouTube live chat (the /live_chat page, which is also the iframe inside a stream page). */
VSCapture.start({
  platform: 'youtube',
  containerSelector: 'yt-live-chat-item-list-renderer #items',
  messageSelector: 'yt-live-chat-text-message-renderer',
  extract: function (el) {
    var msg = el.querySelector('#message');
    if (!msg) return null;
    var nameEl = el.querySelector('#author-name');
    return { id: el.id || '', user: nameEl ? nameEl.textContent.trim() : '', text: msg.textContent };
  }
});
