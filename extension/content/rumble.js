/* Rumble live chat: the chat popout (/chat/popup/...) and the chat inside a live page. */
VSCapture.start({
  platform: 'rumble',
  containerSelector: '#chat-history-list, .chat--height',
  messageSelector: '.chat-history--row',
  settleMs: 350,
  extract: function (el) {
    var msg = el.querySelector('.chat-history--message');
    if (!msg) return null;
    var nameEl = el.querySelector('.chat-history--username');
    return { id: el.getAttribute('data-message-id') || '', user: nameEl ? nameEl.textContent.trim() : '', text: msg.textContent };
  }
});
