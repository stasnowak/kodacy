// Mostek strony z grą love.js: klawisze, ZMIENIACZE i stan gry przez pliki
// na wirtualnym dysku emscripten. Do pary z shimem w editor/js/shim.js.
// Mostek klawiatury: ten build love.js nie podpina w ogóle nasłuchu
// klawiatury w aktualnym Chrome, a mostek JS↔Lua playera (love.js.eval
// przez openURL/prompt) też przestał działać. Kanał, który działa zawsze:
// wpisujemy stan klawiszy PLIKIEM do wirtualnego dysku emscripten
// (Module.FS), a shim w main.lua czyta go co klatkę zwykłym io.open.
//
// Stan łączy cztery źródła, żeby sterowanie działało bez klikania w grę:
//  1. klawisze wciśnięte w tej ramce (gdy gra ma fokus),
//  2. klawisze wciśnięte w rodzicu (gdy dziecko właśnie ruszało suwakiem),
//  3. ekranowe przyciski ⬅️➡️ rodzica (tablet) — parent.__gameKeys(),
//  4. ekranowe przyciski na tej samej stronie — window.__setKey(nazwa, wcisniety).
//
// Ten sam plik ładuje podgląd w Studiu (embed.html, gra w ramce) i gra
// wysłana do sieci (port/www/index.html.template, strona bez rodzica —
// wtedy window.parent === window i wywołania rodzica po prostu nic nie dają).
(function () {
  var map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'space' };
  var down = {};
  function norm(e) { return map[e.key] || String(e.key).toLowerCase(); }
  window.addEventListener('keydown', function (e) { down[norm(e)] = true; }, true);
  window.addEventListener('keyup', function (e) { delete down[norm(e)]; }, true);
  window.addEventListener('blur', function () { down = {}; });

  // ekranowe przyciski (telefon): wcisniety = true przy dotyku, false po puszczeniu
  var virt = {};
  window.__setKey = function (name, isDown) {
    if (isDown) virt[name] = true; else delete virt[name];
  };

  function merged() {
    var all = {};
    for (var k in down) all[k] = true;
    for (var v in virt) all[v] = true;
    try {
      var p = window.parent.__gameKeys ? window.parent.__gameKeys() : '';
      p.split(',').forEach(function (k) { if (k) all[k] = true; });
    } catch (err) { /* rodzic niedostępny — zostają klawisze ramki */ }
    return Object.keys(all).join(',');
  }
  window.__keyState = merged; // do debugowania z konsoli

  // Stan gry dla Studia: shim w main.lua pisze kodacy_stan.txt co klatke
  // (x, y, punkty, wygrana, bledy, zycia, poziom, stan, nr, zdarzenia),
  // a my podajemy go rodzicowi jako obiekt.
  window.__gameState = function () {
    var FS = window.Module && window.Module.FS;
    if (!FS || !saveDir) return null;
    try {
      var txt = new TextDecoder().decode(FS.readFile(saveDir + '/kodacy_stan.txt'));
      var out = {};
      txt.split(',').forEach(function (para) {
        var kv = para.split('=');
        if (kv.length !== 2) return;
        // liczby jako liczby, reszta (stan=gra, zdarzenia=a.b;c.d) jako tekst
        var n = Number(kv[1]);
        out[kv[0]] = kv[1] !== '' && !isNaN(n) ? n : kv[1];
      });
      return out;
    } catch (err) {
      return null; // gra jeszcze nie zdazyla nic napisac
    }
  };

  // Gra przez love.filesystem widzi tylko swój katalog zapisu, więc
  // najpierw znajdujemy go po pliku kodacy_ready.txt, który tworzy shim.
  var saveDir = null;
  function findSaveDir(FS, dir, depth) {
    var names;
    try { names = FS.readdir(dir); } catch (err) { return null; }
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      if (name === '.' || name === '..' || name === 'proc' || name === 'dev') continue;
      var full = (dir === '/' ? '' : dir) + '/' + name;
      if (name === 'kodacy_ready.txt') return dir;
      if (depth > 0) {
        var mode;
        try { mode = FS.stat(full).mode; } catch (err) { continue; }
        if (FS.isDir(mode)) {
          var found = findSaveDir(FS, full, depth - 1);
          if (found) return found;
        }
      }
    }
    return null;
  }

  var last = null;
  var lastVars = null;
  setInterval(function () {
    var FS = window.Module && window.Module.FS;
    if (!FS) return; // silnik jeszcze wstaje
    if (!saveDir) {
      saveDir = findSaveDir(FS, '/', 8);
      if (!saveDir) return; // gra jeszcze nie zdazyla stworzyc kodacy_ready.txt
    }
    var state = merged();
    if (state !== last) {
      try {
        FS.writeFile(saveDir + '/kodacy_keys.txt', state);
        last = state;
      } catch (err) { /* FS chwilowo zajęty — spróbujemy za 33 ms */ }
    }
    // ZMIENIACZE na zywo: rodzic wystawia "NAZWA=wartosc" per linia,
    // shim w main.lua przypisuje je do globali — suwak bez restartu gry.
    try {
      var vars = window.parent.__gameVars ? window.parent.__gameVars() : '';
      if (vars !== lastVars) {
        FS.writeFile(saveDir + '/kodacy_vars.txt', vars);
        lastVars = vars;
      }
    } catch (err) { /* rodzic niedostępny albo FS zajęty — za 33 ms */ }
  }, 33);
})();
