console.log('[browser-ui] loaded');
console.log('[browser-ui] browserApi:', window.browserApi);

const backButton = document.getElementById('back-button');
const forwardButton = document.getElementById('forward-button');
const reloadButton = document.getElementById('reload-button');
const closeButton = document.getElementById('close-button');
const addressBar = document.getElementById('address-bar');

backButton.addEventListener('click', () => {
  window.browserApi.goBack();
});

forwardButton.addEventListener('click', () => {
  window.browserApi.goForward();
});

reloadButton.addEventListener('click', () => {
  window.browserApi.reload();
});

closeButton.addEventListener('click', () => {
  window.browserApi.close();
});

addressBar.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;

  const input = addressBar.value.trim();

  if (!input) return;

  let url;

  if (/^https?:\/\//i.test(input)) {
    url = input;
  } else if (/^[^\s]+\.[^\s]+$/.test(input)) {
    url = `https://${input}`;
  } else {
    url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
  }

  window.browserApi.navigate(url);
});

window.browserApi.onUrlChanged((url) => {
  addressBar.value = url;
});