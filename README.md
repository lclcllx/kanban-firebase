# Quadro Kanban com Firebase

## 1. Criar o projeto no Firebase
1. Acesse console.firebase.google.com e clique em "Adicionar projeto".
2. Em Build > Authentication > Começar > Método de login: ative "E-mail/senha".
3. Em Build > Firestore Database > Criar banco de dados (modo produção, escolha uma região).
4. Na aba Regras do Firestore, cole o conteúdo de firestore.rules e clique em Publicar.
5. Em Configurações do projeto (engrenagem) > Seus apps > "</>" (Web): registre o app
   e copie o objeto firebaseConfig para o arquivo firebase-config.js.

## 2. Testar no computador
Os módulos JS não funcionam abrindo o arquivo direto. Use o Live Server do VS Code
(botão "Go Live") ou rode `npx serve` nesta pasta.

## 3. Publicar com HTTPS (Firebase Hosting)
  npm install -g firebase-tools
  firebase login
  firebase use --add        (escolha o seu projeto)
  firebase deploy
O link terminal em .web.app (HTTPS automático) aparece no fim do comando.

## Segurança
- Senhas são tratadas pelo Firebase Authentication (nunca em texto puro).
- firestore.rules garante que cada usuário só lê e altera as próprias tarefas.
