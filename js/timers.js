/* Timers for breeding and feeding, kept in this browser. */
(function (W) {
  const { el } = W;
  const KEY = 'wt.timers';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const store = (t) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch (e) { /* storage blocked */ } };
  const left = (t) => Math.max(0, t.end - Date.now());
  const clock = (ms) => {
    const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };

  W.pages['mounts/timers'] = function (root) {
    const f = { label: '', kind: 'breed', mats: 1, avg: 20, hours: 1, mount: '' };
    let timers = load();
    const draw = () => root.replaceChildren(el('div', { class: 'cols' }, el('div', {}, form()), el('div', {}, list())));

    const minutes = () => f.kind === 'breed' ? W.BREED_HOURS * 60 : f.kind === 'feed' ? f.mats * W.feedMinutes(Math.ceil(f.avg)) : f.hours * 60;
    function form() {
      return W.win('New timer',
        el('div', { class: 'form' },
          el('label', {}, 'What', W.sel([['breed', 'Breeding (6 hours)'], ['feed', 'Feeding materials'], ['custom', 'Custom']], f.kind, (v) => { f.kind = v; draw(); })),
          el('label', {}, 'Mount (optional)', W.sel([['', '—'], ...W.state.mounts.map(m => [m.id, m.name])], f.mount, (v) => {
            f.mount = v; const m = W.mountById(v); if (m) { f.avg = Math.round(W.avgLim(m) * 100) / 100; if (!f.label) f.label = m.name; } draw();
          })),
          f.kind === 'feed' && el('div', { class: 'two' },
            el('label', {}, 'Materials queued', W.numIn(f.mats, (v) => { f.mats = Math.max(1, v); draw(); }, 1, 7)),
            el('label', {}, 'Average limit', W.numIn(f.avg, (v) => { f.avg = v; draw(); }, 1, 300, 0.01))),
          f.kind === 'custom' && el('label', {}, 'Hours', W.numIn(f.hours, (v) => { f.hours = Math.max(0.01, v); draw(); }, 0, 200, 0.25)),
          el('label', {}, 'Label', el('input', { type: 'text', value: f.label, maxlength: 40, oninput: (e) => { f.label = e.target.value; } }))),
        el('p', { class: 'hint' }, 'Takes ', el('b', {}, W.fmtDur(minutes())), '. Feeding time per material comes from the average limit (rounded up).'),
        el('div', { class: 'btns' },
          el('button', { onclick: () => {
            timers.push({ id: Date.now(), label: f.label || { breed: 'Breeding', feed: 'Feeding', custom: 'Timer' }[f.kind], end: Date.now() + minutes() * 60000, total: minutes() * 60000, done: false });
            store(timers); draw();
          } }, 'Start timer'),
          'Notification' in window && Notification.permission !== 'granted' && el('button', { onclick: () => Notification.requestPermission().then(draw) }, 'Allow notifications')));
    }
    function list() {
      if (!timers.length) return W.win('Running timers', el('p', { class: 'empty' }, 'No timers yet.'));
      return W.win('Running timers', el('div', { class: 'timers' }, timers.slice().sort((a, b) => a.end - b.end).map(t => {
        const ms = left(t);
        return el('div', { class: 'timer' + (ms ? '' : ' done'), 'data-id': t.id },
          el('div', {}, el('b', {}, t.label), el('small', {}, ms ? 'Ready ' + new Date(t.end).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Finished')),
          el('div', { class: 'tclock' }, ms ? clock(ms) : 'Ready'),
          el('div', { class: 'bar' }, el('i', { class: 'bcur', style: { width: (100 - ms / t.total * 100) + '%', '--c': 'var(--gold)' } })),
          el('button', { class: 'mini', onclick: () => { timers = timers.filter(x => x.id !== t.id); store(timers); draw(); } }, 'Remove'));
      })), el('p', { class: 'hint' }, 'Timers keep running when you close the page. Notifications only fire while a Wynntools tab is open.'));
    }
    const tick = setInterval(() => {
      let changed = false;
      timers.forEach(t => {
        if (!t.done && left(t) === 0) {
          t.done = changed = true;
          try { if (Notification.permission === 'granted') new Notification('Wynntools', { body: t.label + ' is ready', icon: 'img/wynntools-logo.png' }); } catch (e) { /* unsupported */ }
        }
      });
      if (changed) store(timers);
      root.querySelectorAll('.timer').forEach(n => {
        const t = timers.find(x => String(x.id) === n.dataset.id); if (!t) return;
        const ms = left(t);
        n.querySelector('.tclock').textContent = ms ? clock(ms) : 'Ready';
        n.querySelector('.bcur').style.width = (100 - ms / t.total * 100) + '%';
        n.classList.toggle('done', !ms);
      });
    }, 1000);
    W.onLeave(() => clearInterval(tick));
    draw();
  };
})(window.W);
