globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  const api = globalThis.KudaeSNS;
  const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const videoMimeTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v']);
  const allowedMimeTypes = new Set([...imageMimeTypes, ...videoMimeTypes]);

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
    if (!api.TARGETS.includes(input.target)) return { ok: false, error: extensionError('INVALID_JOB', '지원하지 않는 SNS입니다.') };
    if (!Number.isFinite(input.createdAt) || Date.now() - input.createdAt > api.JOB_TTL_MS) return { ok: false, error: extensionError('INVALID_JOB', '업로드 요청이 만료됐습니다. 다시 시도해 주세요.') };
    if (!Array.isArray(input.assets) || input.assets.length === 0) return { ok: false, error: extensionError('NO_ASSETS', 'SNS에 전달할 파일이 없습니다.') };
    const youtubeImages = input.target === 'youtube' && input.assets.every((asset) => imageMimeTypes.has(asset?.mimeType?.toLowerCase()));
    const youtubeVideos = input.target === 'youtube' && input.assets.every((asset) => videoMimeTypes.has(asset?.mimeType?.toLowerCase()));
    if (input.target === 'youtube' && !youtubeImages && !youtubeVideos) return { ok: false, error: extensionError('UNSUPPORTED_MIME', 'YouTube 게시물 이미지와 업로드 영상은 한 작업에 섞을 수 없습니다.') };
    if (input.target === 'youtube' && youtubeImages && input.assets.length > 10) return { ok: false, error: extensionError('TOO_MANY_ASSETS', 'YouTube 게시물에는 이미지를 최대 10장까지 넣을 수 있습니다.') };
    if (input.target === 'youtube' && youtubeVideos && input.assets.length > 1) return { ok: false, error: extensionError('TOO_MANY_ASSETS', 'YouTube Studio에는 한 번에 영상 1개만 넣습니다.') };

    const assets = [...input.assets].sort((left, right) => left.order - right.order);
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      if (!asset || asset.order !== index || !validAssetUrl(asset.url)) return { ok: false, error: extensionError('INVALID_JOB', `${index + 1}번 이미지 주소가 안전하지 않습니다.`, '', { assetIndex: index }) };
      if (typeof asset.filename !== 'string' || !/^[a-z0-9._-]{1,80}$/i.test(asset.filename) || typeof asset.mimeType !== 'string') return { ok: false, error: extensionError('INVALID_JOB', `${index + 1}번 이미지 정보가 올바르지 않습니다.`, '', { assetIndex: index }) };
      const targetTypes = input.target === 'youtube' ? allowedMimeTypes : imageMimeTypes;
      if (!targetTypes.has(asset.mimeType)) return { ok: false, error: extensionError('UNSUPPORTED_MIME', `${index + 1}번 파일 형식은 ${api.TARGET_LABELS[input.target]} 자동 전달을 지원하지 않습니다.`, asset.mimeType, { assetIndex: index }) };
    }

    if (input.contentMode !== undefined) {
      if (!['caption', 'separate'].includes(input.contentMode) ||
        (input.contentMode === 'separate' && !['koreapas', 'everytime', 'youtube'].includes(input.target)) ||
        typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500 ||
        typeof input.body !== 'string' || input.body.length > 50000 ||
        typeof input.caption !== 'string' || !input.caption.trim() || input.caption.length > 51000 ||
        typeof input.postId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.postId)) {
        return { ok: false, error: extensionError('INVALID_JOB', '자동 입력할 제목과 본문을 확인해 주세요.') };
      }
    }
    let xThread;
    if(input.target==='x' && input.contentMode) {
      try { xThread=globalThis.KudaeXThread.buildXThread(input.caption,assets.length); }
      catch(error) { return {ok:false,error:extensionError('INVALID_THREAD',error.message || 'X 스레드를 준비할 수 없습니다. 확장을 업데이트해 주세요.')}; }
    } else if(input.target==='x' && assets.length>4) return {ok:false,error:extensionError('TOO_MANY_ASSETS','X 스레드 자동 넣기를 사용하려면 최신 확장과 제목·본문이 필요합니다.')};
    return { ok: true, value: { ...input, assets, xThread, caption: typeof input.caption === 'string' ? input.caption : '' } };
  }

  Object.assign(api, { allowedMimeTypes, imageMimeTypes, videoMimeTypes, extensionError, validAssetUrl, validateJob });
})();
