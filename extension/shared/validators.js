globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  const api = globalThis.KudaeSNS;
  const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

  function extensionError(code, userMessage, detail = '', extra = {}) {
    return { code, userMessage, detail, ...extra };
  }

  function validAssetUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && api.ALLOWED_ASSET_HOSTS.has(url.hostname);
    } catch {
      return false;
    }
  }

  function validateJob(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: extensionError('INVALID_JOB', '업로드 요청 형식이 올바르지 않습니다.') };
    if (typeof input.jobId !== 'string' || !/^[0-9a-f-]{20,64}$/i.test(input.jobId)) return { ok: false, error: extensionError('INVALID_JOB', '업로드 작업 번호가 올바르지 않습니다.') };
    if (input.target !== 'instagram') return { ok: false, error: extensionError('INVALID_JOB', '지원하지 않는 SNS입니다.') };
    if (!Number.isFinite(input.createdAt) || Date.now() - input.createdAt > api.JOB_TTL_MS) return { ok: false, error: extensionError('INVALID_JOB', '업로드 요청이 만료됐습니다. 다시 시도해 주세요.') };
    if (!Array.isArray(input.assets) || input.assets.length === 0) return { ok: false, error: extensionError('NO_ASSETS', 'Instagram에 전달할 이미지가 없습니다.') };

    const assets = [...input.assets].sort((left, right) => left.order - right.order);
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      if (!asset || asset.order !== index || !validAssetUrl(asset.url)) return { ok: false, error: extensionError('INVALID_JOB', `${index + 1}번 이미지 주소가 안전하지 않습니다.`, '', { assetIndex: index }) };
      if (typeof asset.filename !== 'string' || !/^[a-z0-9._-]{1,80}$/i.test(asset.filename) || typeof asset.mimeType !== 'string') return { ok: false, error: extensionError('INVALID_JOB', `${index + 1}번 이미지 정보가 올바르지 않습니다.`, '', { assetIndex: index }) };
      if (!allowedMimeTypes.has(asset.mimeType)) return { ok: false, error: extensionError('UNSUPPORTED_MIME', `${index + 1}번 이미지 형식은 Instagram 자동 전달을 지원하지 않습니다.`, asset.mimeType, { assetIndex: index }) };
    }

    return { ok: true, value: { ...input, assets, caption: typeof input.caption === 'string' ? input.caption : '' } };
  }

  Object.assign(api, { allowedMimeTypes, extensionError, validAssetUrl, validateJob });
})();
