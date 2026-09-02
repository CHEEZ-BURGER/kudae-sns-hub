const input = document.querySelector('#target');
const result = document.querySelector('#result');
const filesView = document.querySelector('#files');
const port = chrome.runtime.connect({ name: 'KUDAE_SNS_UPLOAD' });
let jobId = '';
let files = [];
let objectUrls = [];

function canvasPng(number) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 360; canvas.height = 450;
    const context = canvas.getContext('2d');
    context.fillStyle = number % 2 ? '#ff205c' : '#1d1d1d'; context.fillRect(0, 0, 360, 450);
    context.fillStyle = 'white'; context.font = '900 28px sans-serif'; context.fillText('고대신문', 28, 55);
    context.font = '900 92px sans-serif'; context.fillText(String(number).padStart(2, '0'), 105, 250);
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 생성 실패')), 'image/png');
  });
}

async function run(count) {
  clear();
  result.textContent = `PNG ${count}장 생성 중…`;
  const blobs = await Promise.all(Array.from({ length: count }, (_, index) => canvasPng(index + 1)));
  objectUrls = blobs.map((blob) => URL.createObjectURL(blob));
  port.postMessage({ type: 'FIXTURE_REQUEST', urls: objectUrls });
}

function clear() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
  files.length = 0; files = []; input.value = ''; filesView.replaceChildren();
  result.textContent = '초기화했습니다.';
}

function inject() {
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
  descriptor.set.call(input, transfer.files);
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

port.onMessage.addListener((message) => {
  if (message.type === 'REQUEST_READY') return;
  if (message.type === 'JOB_START') { jobId = message.jobId; files = new Array(message.total); result.textContent = `File 수신 중 0/${message.total}`; return; }
  if (message.type === 'ASSET' && message.jobId === jobId) { files[message.index] = message.file; result.textContent = `File 수신 중 ${files.filter(Boolean).length}/${files.length}`; return; }
  if (message.type === 'JOB_END' && message.jobId === jobId) inject();
});

input.addEventListener('change', () => {
  const received = [...input.files];
  result.textContent = `${received.length}개 File 자동 삽입 완료 · ${received.map((file) => file.name).join(' → ')}`;
  filesView.replaceChildren(...received.map((file) => {
    const card = document.createElement('div'); card.className = 'file';
    const image = document.createElement('img'); const preview = URL.createObjectURL(file); image.src = preview; image.onload = () => URL.revokeObjectURL(preview);
    const label = document.createElement('span'); label.textContent = `${file.name}\n${file.type}`;
    card.append(image, label); return card;
  }));
  objectUrls.forEach((url) => URL.revokeObjectURL(url)); objectUrls = [];
});

document.querySelectorAll('[data-count]').forEach((button) => button.addEventListener('click', () => run(Number(button.dataset.count))));
document.querySelector('#clear').addEventListener('click', clear);
