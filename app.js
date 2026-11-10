import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const COLUMNS = [
  { id: 'todo',  name: 'A Fazer' },
  { id: 'doing', name: 'Em Andamento' },
  { id: 'done',  name: 'Concluído' }
];
const $ = (s, r = document) => r.querySelector(s);

const configured = !Object.values(firebaseConfig).some(v => String(v).includes('COLE_AQUI'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let tasks = [];
let dragId = null;
let currentUid = null;
let unsubscribe = null;

const tasksCol = () => collection(db, 'usuarios', currentUid, 'tarefas');
const taskDoc = id => doc(db, 'usuarios', currentUid, 'tarefas', id);

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function erroAmigavel(e) {
  const m = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/invalid-email': 'Digite um e-mail válido.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use a aba Entrar.',
    'auth/weak-password': 'Senha fraca. Use pelo menos 8 caracteres, com letras e números.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
    'auth/network-request-failed': 'Sem conexão com a internet. Verifique sua rede.',
    'permission-denied': 'Sem permissão para essa ação. Entre novamente.'
  };
  return m[e.code] || 'Algo deu errado. Tente novamente.';
}

// ---------- Quadro ----------
function render() {
  const board = $('#board');
  board.innerHTML = '';
  COLUMNS.forEach(col => {
    const items = tasks.filter(t => t.status === col.id);
    const section = document.createElement('section');
    section.className = 'column';
    section.dataset.status = col.id;
    section.setAttribute('aria-labelledby', 'h-' + col.id);

    const head = document.createElement('div');
    head.className = 'column-head';
    head.innerHTML = `<h2 id="h-${col.id}">${col.name}</h2><span class="count" aria-label="${items.length} tarefas">${items.length}</span>`;

    const list = document.createElement('div');
    list.className = 'list';
    list.addEventListener('dragover', e => { e.preventDefault(); list.classList.add('over'); });
    list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) list.classList.remove('over'); });
    list.addEventListener('drop', e => {
      e.preventDefault();
      list.classList.remove('over');
      if (dragId !== null) moveTask(dragId, col.id);
    });

    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Nenhuma tarefa aqui. Arraste um card para cá.';
      list.appendChild(p);
    }
    items.forEach(t => list.appendChild(cardEl(t)));

    section.append(head, list);
    board.appendChild(section);
  });
}

function cardEl(t) {
  const card = document.createElement('article');
  card.className = 'card';
  card.draggable = true;
  card.style.setProperty('--c', `var(--${t.status})`);

  const h = document.createElement('h3'); h.textContent = t.title;
  card.appendChild(h);
  if (t.desc) { const p = document.createElement('p'); p.textContent = t.desc; card.appendChild(p); }

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `Mover “${t.title}” para`);
  COLUMNS.forEach(c => sel.appendChild(new Option(c.name, c.id, false, c.id === t.status)));
  sel.addEventListener('change', () => moveTask(t.id, sel.value));
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-danger';
  del.textContent = 'Excluir';
  del.setAttribute('aria-label', `Excluir tarefa “${t.title}”`);
  del.addEventListener('click', () => deleteTask(t.id));
  actions.append(sel, del);
  card.appendChild(actions);

  card.addEventListener('dragstart', e => {
    dragId = t.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });
  card.addEventListener('dragend', () => {
    dragId = null;
    card.classList.remove('dragging');
    document.querySelectorAll('.list.over').forEach(l => l.classList.remove('over'));
  });
  return card;
}

// A tela é atualizada pelo onSnapshot; aqui só gravamos no Firestore.
async function moveTask(id, status) {
  const t = tasks.find(x => x.id === id);
  if (!t || t.status === status) { render(); return; }
  try {
    await updateDoc(taskDoc(id), { status });
    toast('Tarefa movida para “' + COLUMNS.find(c => c.id === status).name + '”.');
  } catch (e) { toast(erroAmigavel(e), true); render(); }
}

async function deleteTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t || !confirm('Excluir a tarefa “' + t.title + '”? Esta ação não pode ser desfeita.')) return;
  try {
    await deleteDoc(taskDoc(id));
    toast('Tarefa excluída.');
  } catch (e) { toast(erroAmigavel(e), true); }
}

// ---------- Modal de nova tarefa ----------
const modal = $('#modal'), form = $('#taskForm'), title = $('#title'), err = $('#titleErr');
$('#openModal').addEventListener('click', () => {
  form.reset(); err.textContent = ''; title.removeAttribute('aria-invalid');
  modal.showModal(); title.focus();
});
$('#cancel').addEventListener('click', () => modal.close());
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

form.addEventListener('submit', async e => {
  e.preventDefault();
  const t = title.value.trim();
  if (!t) {
    err.textContent = 'Digite um título para a tarefa.';
    title.setAttribute('aria-invalid', 'true');
    title.focus();
    return;
  }
  try {
    await addDoc(tasksCol(), {
      title: t, desc: $('#desc').value.trim(), status: 'todo', criadoEm: serverTimestamp()
    });
    modal.close();
    toast('Tarefa adicionada em “A Fazer”.');
  } catch (e2) { err.textContent = erroAmigavel(e2); }
});
title.addEventListener('input', () => { err.textContent = ''; title.removeAttribute('aria-invalid'); });

// ---------- Login e cadastro (Firebase Authentication) ----------
let mode = 'login';
const authErr = $('#authErr');

function setMode(m) {
  mode = m;
  const reg = m === 'register';
  $('#tabLogin').setAttribute('aria-selected', String(!reg));
  $('#tabRegister').setAttribute('aria-selected', String(reg));
  $('#nameWrap').hidden = !reg;
  $('#passHint').hidden = !reg;
  $('#authTitle').textContent = reg ? 'Criar uma conta' : 'Entrar na sua conta';
  $('#authSubmit').textContent = reg ? 'Criar conta' : 'Entrar';
  $('#aPass').autocomplete = reg ? 'new-password' : 'current-password';
  authErr.textContent = '';
}
$('#tabLogin').addEventListener('click', () => setMode('login'));
$('#tabRegister').addEventListener('click', () => setMode('register'));

$('#authForm').addEventListener('submit', async e => {
  e.preventDefault();
  authErr.textContent = '';
  if (!configured) {
    authErr.textContent = 'Falta configurar o Firebase: preencha o arquivo firebase-config.js.';
    return;
  }
  const nome = $('#aName').value.trim();
  const email = $('#aEmail').value.trim();
  const senha = $('#aPass').value;
  if (!email || !senha) { authErr.textContent = 'Preencha o e-mail e a senha.'; return; }
  const reg = mode === 'register';
  if (reg) {
    if (!nome) { authErr.textContent = 'Digite seu nome.'; return; }
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha)) {
      authErr.textContent = 'A senha precisa ter pelo menos 8 caracteres, com letras e números.'; return;
    }
  }
  const btn = $('#authSubmit');
  btn.disabled = true;
  try {
    if (reg) {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await updateProfile(cred.user, { displayName: nome });
      $('#userName').textContent = 'Olá, ' + nome;
      toast('Conta criada. Bem-vindo, ' + nome + '!');
    } else {
      await signInWithEmailAndPassword(auth, email, senha);
      toast('Login realizado com sucesso.');
    }
    $('#authForm').reset();
  } catch (e2) { authErr.textContent = erroAmigavel(e2); }
  btn.disabled = false;
});

function showApp(user) {
  currentUid = user.uid;
  $('#auth').hidden = true;
  $('#board').hidden = false;
  $('#userBar').hidden = false;
  $('#userName').textContent = 'Olá, ' + (user.displayName || user.email);
  // Escuta as tarefas do usuário em tempo real
  unsubscribe = onSnapshot(
    query(tasksCol(), orderBy('criadoEm')),
    snap => { tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })); render(); },
    e => toast(erroAmigavel(e), true)
  );
}
function showAuth() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  currentUid = null; tasks = [];
  $('#board').hidden = true;
  $('#userBar').hidden = true;
  $('#auth').hidden = false;
  setMode('login');
  $('#aEmail').focus();
}

$('#logout').addEventListener('click', async () => {
  await signOut(auth);
  toast('Você saiu da conta.');
});

// Reage a login, logout e sessão já existente ao abrir a página
onAuthStateChanged(auth, user => (user ? showApp(user) : showAuth()));
