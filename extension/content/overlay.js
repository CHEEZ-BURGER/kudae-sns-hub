globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  class StatusOverlay {
    constructor(onCancel) {
      this.host = document.createElement('div');
      this.host.id = 'kudae-sns-upload-helper';
      this.host.style.cssText = 'position:fixed;z-index:2147483647;right:16px;top:16px;pointer-events:none';
      this.root = this.host.attachShadow({ mode: 'closed' });
      this.root.innerHTML = `<style>
        :host{all:initial}*{box-sizing:border-box}.box{width:min(310px,calc(100vw - 32px));border:1px solid #ffd0dd;border-radius:14px;background:#fffafb;color:#1d1d1d;box-shadow:0 16px 46px rgba(29,29,29,.2);padding:14px;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto}.head{display:flex;align-items:center;justify-content:space-between;gap:10px}.brand{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:900}.dot{width:9px;height:9px;border-radius:99px;background:#ff205c;box-shadow:0 0 0 4px #ffe8ef}.state{margin:10px 0 0;font-size:13px;font-weight:850;line-height:1.5}.detail{margin:4px 0 0;color:#6d6266;font-size:11px;line-height:1.5}.progress{height:6px;overflow:hidden;margin-top:10px;border-radius:99px;background:#f2e8eb}.progress>i{display:block;width:0;height:100%;border-radius:inherit;background:#ff205c;transition:width .2s}.cancel{border:0;background:transparent;color:#8b7d82;font-size:11px;font-weight:800;cursor:pointer}.cancel:hover{color:#ff205c}.done .dot{background:#218058;box-shadow:0 0 0 4px #dff3e9}.error .dot{background:#aa2929;box-shadow:0 0 0 4px #f9dddd}
      </style><section class="box"><div class="head"><div class="brand"><i class="dot"></i>고대신문 SNS Helper</div><button class="cancel" type="button">취소</button></div><p class="state">Instagram 연결 중</p><p class="detail">잠시만 기다려 주세요.</p><div class="progress"><i></i></div></section>`;
      this.box = this.root.querySelector('.box');
      this.state = this.root.querySelector('.state');
      this.detail = this.root.querySelector('.detail');
      this.bar = this.root.querySelector('.progress i');
      this.root.querySelector('.cancel').addEventListener('click', onCancel);
      document.documentElement.append(this.host);
    }
    update(message, detail = '', current = 0, total = 0) {
      this.state.textContent = message;
      this.detail.textContent = detail;
      this.bar.style.width = total ? `${Math.round((current / total) * 100)}%` : '18%';
    }
    complete(message, detail = '크롭과 본문을 확인한 뒤 게시 버튼은 직접 눌러 주세요.') {
      this.box.classList.add('done');
      this.state.textContent = message;
      this.detail.textContent = detail;
      this.bar.style.width = '100%';
      this.root.querySelector('.cancel').textContent = '닫기';
    }
    error(message, detail = '') {
      this.box.classList.add('error');
      this.state.textContent = message;
      this.detail.textContent = detail;
      this.root.querySelector('.cancel').textContent = '닫기';
    }
    remove() { this.host.remove(); }
  }

  globalThis.KudaeSNS.StatusOverlay = StatusOverlay;
})();
