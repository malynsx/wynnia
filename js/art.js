/* Tiny pixel-art sprites drawn to canvas, tinted by mount colours. */
(function (W) {
  const MOUNT = {
    horse: [
      '................',
      '....oo..oo......',
      '...obbo.obbo....',
      '...obbbobbbo....',
      '..oaabbbbbbo....',
      '.oaaaabbbbbbo...',
      '.oaaaakabbbbo...',
      '.oaaaaaaabbbo...',
      'oaaaaaaaaabbo...',
      'oaaaaaaaaaabbo..',
      'oaaaaaaaaaaabo..',
      'onnaaaaaaaaaabo.',
      'onnaaaaaaaaaaabo',
      '.ooaaaaaaaaaaabo',
      '...ooaaaaaaaaao.',
      '.....ooooooooo..',
    ],
    wyvern: [
      '................',
      '.o..........o...',
      '.oo.........oo..',
      '..obo.....obbo..',
      '...obbo.obbbo...',
      '....obbbbbbo....',
      '..ooaaabbbbo....',
      '.oaaaaaakabbo...',
      'oaaaaaaaaabbo...',
      'oaaaaaaaaaabo...',
      'owwaaaaaaaabo...',
      'onwaaaaaaaaabo..',
      '.oowwaaaaaaabo..',
      '...oooaaaaaaao..',
      '.....ooooooooo..',
      '................',
    ],
    adasaur: [
      '................',
      '.......o.o.o....',
      '......obobobo...',
      '.....obbbbbbbo..',
      '...ooaabbbbbbo..',
      '..oaaaaabbbbo...',
      '.oaaaaakaabbo...',
      'oaaaaaaaaaabo...',
      'oaaaaaaaaaaabo..',
      'oaaaaaaaaaaabo..',
      'onnaaaaaaaaabo..',
      'onnaaaaaaaaaabo.',
      '.ooaaaaaaaaaabo.',
      '...oooaaaaaaao..',
      '.....ooooooo....',
      '................',
    ],
  };

  const MAT = {
    ingot:  { map: ['............','............','....hhhhhhh.','...hmmmmmmd.','..hmmmmmmdd.','.hhhhhhhhdd.','.hmmmmmmddd.','.hmmmmmmdd..','.dddddddd...','............','............','............'], pal: { h: '#e8eaf0', m: '#b9bfcc', d: '#7d8494' } },
    gem:    { map: ['............','....hhhh....','...hllllh...','..hlllmmmh..','..hllmmmdd..','...hmmmdd...','....hmdd....','.....dd.....','............','............','............','............'], pal: { h: '#d7fff4', l: '#7cf0d0', m: '#33c4a0', d: '#1c7d66' } },
    plank:  { map: ['............','............','.hhhhhhhhhh.','.mmmmmmmmmm.','.mdmmmmmdmm.','.mmmmdmmmmm.','.mmmmmmmmmm.','.dddddddddd.','............','............','............','............'], pal: { h: '#e1b878', m: '#bf8d4f', d: '#8a5f2c' } },
    paper:  { map: ['............','..hhhhhhh...','..hpppppph..','..hpdddddh..','..hppppppd..','..hpdddddd..','..hppppppd..','..hdddddd...','............','............','............','............'], pal: { h: '#ffffff', p: '#ecebe2', d: '#b9b7a6' } },
    string: { map: ['............','..hh........','..hmmh......','...hmmh.....','....hmmh....','...hmmh.....','..hmmh......','..hmmmh.....','...hhmmh....','.....hhh....','............','............'], pal: { h: '#ffffff', m: '#dcdcdc', d: '#999' } },
    grain:  { map: ['............','....y.y.....','...yyyyy....','..yyyyyyy...','...yyyyy....','.....d......','.....d......','.....d......','............','............','............','............'], pal: { y: '#e8c64a', d: '#9a7a22' } },
    oil:    { map: ['............','....cc......','....cc......','...hhhh.....','..hmmmmh....','..hmmmmh....','..hlmmmh....','..hmmmmh....','...hhhh.....','............','............','............'], pal: { c: '#6b4a2b', h: '#e9b83a', m: '#c98d12', l: '#ffe48a' } },
    meat:   { map: ['............','...rrrr.....','..rhrrrr....','..rrrrrrd...','..rrrrrrd...','...rrrdd....','....wd......','.....w......','....www.....','............','............','............'], pal: { r: '#c8503f', h: '#f08a77', d: '#8a2e22', w: '#f1ebd9' } },
  };

  const cache = {};
  function draw(map, palette, px) {
    const n = map.length, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    for (let y = 0; y < n; y++) for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (ch === '.' || !palette[ch]) continue;
      g.fillStyle = palette[ch];
      g.fillRect(x, y, 1, 1);
    }
    c.className = 'sprite';
    return c;
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, Math.max(0, Math.round((n >> 16) * f)));
    const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
    const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  W.art = {
    mount(type, c1, c2) {
      const body = W.colorHex(c1), mane = W.colorHex(c2);
      return draw(MOUNT[type] || MOUNT.horse, {
        o: '#14100a', a: body, b: mane, k: '#0a0a0a', w: '#f4f1e8',
        n: shade(body, 0.7),
      });
    },
    mat(k) { return draw(MAT[k].map, MAT[k].pal); },
    favicon() {
      const c = W.art.mount('horse', 'Bay', 'Night');
      const l = document.createElement('link');
      l.rel = 'icon'; l.href = c.toDataURL();
      document.head.append(l);
    },
  };
})(window.W);
