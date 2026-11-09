/* Kick chat: works on the channel page and in the chat popout. */
(function () {
  var USER = '.chat-entry-username, button.inline.font-bold[data-prevent-expand], button[title], button.font-bold';
  var CONTENT = '.chat-entry-content, .break-all, seventv-container, span[class*="font-normal"], div[class*="font-normal"]';

  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  VSCapture.start({
    platform: 'kick',
    containerSelector: '#chatroom-messages, #chatroom',
    messageSelector: '[data-chat-entry], #chatroom-messages [data-index], #chatroom [data-index]',
    watchInside: true,
    settleMs: 250,
    extract: function (el) {
      if (el.querySelector('[class^="deleted-message"], .line-through')) return null;
      var userEl = el.querySelector(USER);
      var user = userEl ? clean(userEl.textContent) : '';
      var text = '';
      var nodes = Array.prototype.filter.call(el.querySelectorAll(CONTENT), function (n) {
        return !(userEl && (n === userEl || userEl.contains(n) || n.contains(userEl)));
      });
      // read only the outermost nodes: a parent already includes its children
      var roots = nodes.filter(function (n) { return !nodes.some(function (p) { return p !== n && p.contains(n); }); });
      text = clean(roots.map(function (n) { return n.textContent; }).join(' '));
      if (!text) {
        // fallback: everything in the row except the user name
        text = clean(el.textContent);
        if (user) { var i = text.indexOf(user); if (i !== -1) text = text.slice(i + user.length); }
        text = text.replace(/^[\s:]+/, '');
      }
      var mid = el.getAttribute('data-mid') || (el.querySelector('[data-mid]') || {}).getAttribute && el.querySelector('[data-mid]').getAttribute('data-mid') || '';
      return { id: mid, user: user, text: text };
    }
  });
})();
