(function(){
  var $ = function(id){ return document.getElementById(id); };
  var A = window.__escala;
  var ESTADO = 'escala_app_estado_v1';

  /* ---------- diálogos ---------- */
  function fecharDialogo(){ $('app-dialog').innerHTML = ''; }
  function dialogo(titulo, texto, botoes, extra){
    var d = $('app-dialog');
    $('app-toast').classList.remove('on');
    d.innerHTML = '<div class="esc-modal-overlay"><div class="esc-modal"><h3></h3>' + (texto ? '<p></p>' : '') + '<div id="app-d-x"></div><div class="esc-modal-actions' + (botoes.length === 1 ? ' app-one' : '') + '" id="app-d-b"></div></div></div>';
    d.querySelector('h3').textContent = titulo;
    if (texto) d.querySelector('p').textContent = texto;
    if (extra) extra($('app-d-x'));
    botoes.forEach(function(b){
      var el = document.createElement('button');
      el.className = 'esc-modal-btn' + (b.primary ? ' primary' : '');
      el.textContent = b.t;
      el.addEventListener('click', function(){ fecharDialogo(); if (b.f) b.f(); });
      $('app-d-b').appendChild(el);
    });
  }
  window.alert = function(m){ dialogo('Atenção', String(m), [{t: 'OK', primary: true}]); };
  var tt;
  function toast(m){ var e = $('app-toast'); e.textContent = m; e.classList.add('on'); clearTimeout(tt); tt = setTimeout(function(){ e.classList.remove('on'); }, 2600); }

  window.__appPerguntarSalao = function(codigo, qtd, cb){
    dialogo('Salão · ' + codigo, 'Quantos operadores desta máquina estão no salão?', [{t: 'Cancelar', f: function(){ cb(null); }}], function(x){
      var w = document.createElement('div'); w.className = 'app-num';
      for (var i = 1; i <= qtd; i++) (function(n){
        var b = document.createElement('button'); b.textContent = n;
        b.addEventListener('click', function(){ fecharDialogo(); cb(n); });
        w.appendChild(b);
      })(i);
      x.appendChild(w);
    });
  };

  /* ---------- entrega de arquivos ---------- */
  var MIME = {xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pdf: 'application/pdf', png: 'image/png', zip: 'application/zip'};
  function comoArquivo(blob, nome){ return new File([blob], nome, {type: MIME[nome.split('.').pop().toLowerCase()] || blob.type || 'application/octet-stream'}); }
  function enviar(arquivos){
    if (navigator.canShare && navigator.share && navigator.canShare({files: arquivos})){
      return navigator.share({files: arquivos}).catch(function(e){
        if (e && e.name !== 'AbortError') baixar(arquivos[0]);
      });
    }
    arquivos.forEach(baixar);
  }
  function baixar(f){
    var u = URL.createObjectURL(f), a = document.createElement('a');
    a.href = u; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(u); }, 60000);
  }
  // O iPhone só abre "Compartilhar" a partir de um toque, então a
  // entrega acontece numa folha depois que os arquivos ficam prontos.
  window.__appEntregar = function(blob, nome){
    return JSZip.loadAsync(blob).then(function(zip){
      var nomes = Object.keys(zip.files).filter(function(n){ return !zip.files[n].dir; });
      return Promise.all(nomes.map(function(n){ return zip.files[n].async('blob').then(function(b){ return comoArquivo(b, n); }); }));
    }).then(function(soltos){
      var pacote = comoArquivo(blob, nome);
      $('app-busy').classList.remove('on');
      dialogo('Arquivos prontos', soltos.length + ' arquivos. Salve em Arquivos ou envie pelo WhatsApp, e-mail ou outro app.', [
        {t: 'Fechar'},
        {t: 'Salvar pacote (.zip)', primary: true, f: function(){ enviar([pacote]); }}
      ], function(x){
        soltos.forEach(function(f){
          var r = document.createElement('div'); r.className = 'app-file';
          var s = document.createElement('span'); s.textContent = f.name;
          var b = document.createElement('button'); b.textContent = 'Enviar';
          b.addEventListener('click', function(){ enviar([f]); });
          r.appendChild(s); r.appendChild(b); x.appendChild(r);
        });
      });
    });
  };
  window.__appGerar = function(fn){
    $('app-busy').classList.add('on');
    setTimeout(function(){
      Promise.resolve().then(fn).catch(function(e){
        console.error(e);
        alert('Não foi possível gerar os arquivos: ' + (e && e.message || 'erro desconhecido'));
      }).then(function(){ $('app-busy').classList.remove('on'); atualizar(); salvar(); });
    }, 60);
  };

  /* ---------- Personnel guardado no aparelho ---------- */
  function idb(){
    return new Promise(function(ok, no){
      var r = indexedDB.open('escala_app', 1);
      r.onupgradeneeded = function(){ r.result.createObjectStore('kv'); };
      r.onsuccess = function(){ ok(r.result); };
      r.onerror = function(){ no(r.error); };
    });
  }
  function kv(modo, fn){
    return idb().then(function(db){ return new Promise(function(ok, no){
      var t = db.transaction('kv', modo), r = fn(t.objectStore('kv'));
      t.oncomplete = function(){ ok(r && r.result); };
      t.onerror = t.onabort = function(){ no(t.error); };
    }); });
  }
  var restaurando = false;
  window.__appPersonnelOk = function(file, buf){
    $('file-personnel').value = '';
    if (restaurando) return;
    kv('readwrite', function(s){ return s.put({nome: file.name, buf: buf, em: Date.now()}, 'personnel'); }).catch(function(){});
    salvar();
    atualizar();
    toast('Personnel salvo neste iPhone.');
  };

  /* ---------- salvar e retomar a escala ---------- */
  var st;
  function salvar(){ try { localStorage.setItem(ESTADO, JSON.stringify(A.snapshot())); } catch (e){ console.warn(e); } }
  function agendar(){ clearTimeout(st); st = setTimeout(function(){ salvar(); atualizar(); }, 150); }
  document.addEventListener('click', agendar);
  document.addEventListener('change', agendar);
  document.addEventListener('input', agendar);
  document.addEventListener('visibilitychange', function(){ if (document.hidden) salvar(); });
  window.addEventListener('pagehide', salvar);

  function retomar(){
    var salvo = null;
    try { salvo = JSON.parse(localStorage.getItem(ESTADO) || 'null'); } catch (e){}
    return kv('readonly', function(s){ return s.get('personnel'); }).then(function(p){
      if (salvo && salvo.turno) $('sel-turno').value = salvo.turno;
      if (!p) { A.mudouTurno(); atualizar(); return; }
      restaurando = true;
      return new Promise(function(ok){
        var antigo = window.__appPersonnelOk;
        window.__appPersonnelOk = function(file, buf){ window.__appPersonnelOk = antigo; antigo(file, buf); ok(); };
        var ev = new CustomEvent('change', {detail: {file: new File([p.buf], p.nome)}});
        $('file-personnel').dispatchEvent(ev);
      }).then(function(){
        if (salvo) A.restore(salvo);
        restaurando = false;
        var quando = new Date(p.em).toLocaleDateString('pt-BR');
        $('stat-upload').textContent = '✓ ' + p.nome + ' · carregado em ' + quando + ' · ' + A.contagem() + ' pessoas';
        atualizar();
      });
    }).catch(function(e){ restaurando = false; console.warn(e); atualizar(); });
  }

  /* ---------- navegação ---------- */
  function irPara(tab){
    document.querySelectorAll('.app-pane').forEach(function(p){ p.classList.toggle('on', p.id === 'pane-' + tab); });
    document.querySelectorAll('.app-tabs button').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    document.body.classList.toggle('has-bar', tab === 'montar' || tab === 'maquinas');
    window.scrollTo(0, 0);
    try { sessionStorage.setItem('escala_tab', tab); } catch (e){}
  }
  document.querySelector('.app-tabs').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (b) irPara(b.getAttribute('data-tab'));
  });
  $('app-chips').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    var alvo = $(b.getAttribute('data-go')), h = document.querySelector('.app-head').offsetHeight;
    window.scrollTo({top: alvo.getBoundingClientRect().top + window.pageYOffset - h - 4, behavior: 'smooth'});
  });

  /* ---------- quantidades: stepper e agrupamento ---------- */
  document.querySelectorAll('#grid-qty .esc-qty-item').forEach(function(it){
    var inp = it.querySelector('.esc-qty-input');
    inp.setAttribute('inputmode', 'numeric');
    var stp = document.createElement('div'); stp.className = 'app-stepper';
    function bt(t, d, rot){
      var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.setAttribute('aria-label', rot + ' ' + inp.getAttribute('data-machine'));
      b.addEventListener('click', function(){
        var v = Math.max(0, Math.min(9, (parseInt(inp.value, 10) || 0) + d));
        inp.value = v; inp.dispatchEvent(new Event('input', {bubbles: true}));
      });
      return b;
    }
    it.insertBefore(stp, inp);
    stp.appendChild(bt('−', -1, 'Menos')); stp.appendChild(inp); stp.appendChild(bt('+', 1, 'Mais'));
    var tog = document.createElement('div'); tog.className = 'app-tog';
    it.querySelectorAll('.esc-qty-retrabalho,.esc-qty-restrito,.esc-qty-salao').forEach(function(s){ tog.appendChild(s); });
    it.appendChild(tog);
  });
  [['B01','Bloco B'],['C03','Bloco C'],['D01','Bloco D'],['E01','Bloco E'],['HOTSTAMPING','Especiais']].forEach(function(g){
    var inp = document.querySelector('.esc-qty-input[data-machine="' + g[0] + '"]');
    var h = document.createElement('div'); h.className = 'app-bloco'; h.textContent = g[1];
    var it = inp.closest('.esc-qty-item'); it.parentNode.insertBefore(h, it);
  });

  /* ---------- resumo ---------- */
  function atualizar(){
    var total = 0;
    document.querySelectorAll('.esc-qty-input').forEach(function(i){
      var n = parseInt(i.value, 10) || 0; total += n;
      i.closest('.esc-qty-item').classList.toggle('ativa', n > 0);
    });
    $('app-total').textContent = total + (total === 1 ? ' vaga' : ' vagas');
    var alguma = false;
    ['B','C','D','E','Esp'].forEach(function(s){
      var v = $('sec-' + s).querySelector('.esc-card:not(.esc-card-oculto)');
      $('sec-' + s).style.display = v ? '' : 'none';
      document.querySelector('[data-go="sec-' + s + '"]').style.display = v ? '' : 'none';
      if (v) alguma = true;
    });
    $('app-vazio').style.display = alguma ? 'none' : '';
    $('app-chips').style.display = alguma ? '' : 'none';
    var f = document.querySelectorAll('#pane-maquinas .esc-card:not(.esc-card-oculto) .esc-slot.faltando').length;
    $('app-faltam').textContent = f || '';
    var a = $('sel-turno').value === '1';
    $('tab-offset').style.display = a ? '' : 'none';
    if (!a && $('pane-offset').classList.contains('on')) irPara('montar');
  }

  /* ---------- ações ---------- */
  $('btn-fazer-escala').addEventListener('click', function(){
    if (!A.contagem()) return;
    setTimeout(function(){
      atualizar(); irPara('maquinas');
      var f = $('app-faltam').textContent;
      toast(f ? 'Escala feita. Faltam ' + f + ' operador(es).' : 'Escala feita.');
    }, 0);
  });
  $('btn-preencher-postos').addEventListener('click', function(){ if (A.contagem()) toast('Postos de apoio preenchidos. Veja em Apoio.'); });
  $('app-nova').addEventListener('click', function(){
    dialogo('Nova escala?', 'Zera quantidades e escala. O Personnel continua salvo.', [{t: 'Cancelar'}, {t: 'Zerar', primary: true, f: function(){ A.nova(); salvar(); atualizar(); toast('Escala zerada.'); }}]);
  });
  $('app-limpar').addEventListener('click', function(){
    dialogo('Limpar tudo?', 'Apaga a escala e o Personnel deste iPhone. Será preciso carregar a planilha de novo.', [{t: 'Cancelar'}, {t: 'Limpar', primary: true, f: function(){
      $('btn-limpar').click();
      kv('readwrite', function(s){ return s.delete('personnel'); }).catch(function(){});
      salvar(); atualizar();
    }}]);
  });
  var inst = $('app-install');
  var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  var dispensou = false; try { dispensou = localStorage.getItem('escala_install_x') === '1'; } catch (e){}
  if (!standalone && !dispensou && /iPhone|iPad/.test(navigator.userAgent)) inst.hidden = false;
  $('app-install-x').addEventListener('click', function(){ inst.hidden = true; try { localStorage.setItem('escala_install_x', '1'); } catch (e){} });

  var inicial = 'montar'; try { inicial = sessionStorage.getItem('escala_tab') || 'montar'; } catch (e){}
  irPara(inicial);
  atualizar();
  retomar();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function(){});
})();
