/* Twitch chat (main page, popout and embed). Works with and without 7TV. */
VSCapture.start({
  platform: 'twitch',
  containerSelector: '.chat-scrollable-area__message-container, .chat-list--default, .chat-list--other, .chat-room__content',
  messageSelector: '.chat-line__message, .seventv-message',
  extract: function (el) {
    if (el.classList.contains('chat-line__message--deleted-notice') ||
        el.querySelector('[data-a-target="chat-deleted-message-placeholder"]')) return null;
    var text;
    var body = el.querySelector(
      "[data-a-target='chat-line-message-body'], [data-test-selector='chat-line-message-body'], .seventv-chat-message-body"
    );
    if (body) {
      text = body.textContent;
    } else {
      // Fallback if Twitch renames the wrapper: join the text pieces of the message.
      var parts = el.querySelectorAll('.text-fragment, [data-a-target="chat-message-text"]');
      if (!parts.length) return null;
      text = Array.prototype.map.call(parts, function (p) { return p.textContent; }).join('');
    }
    var nameEl = el.querySelector('.chat-author__display-name, .seventv-chat-user-username, .chatter-name');
    return { id: '', user: nameEl ? nameEl.textContent.trim() : '', text: text };
  }
});
