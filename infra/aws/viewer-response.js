// CloudFront Function, viewer-response association. CDN caches the origin response,
// while browsers are instructed not to persist private newsroom media to disk.
function handler(event) {
  var response = event.response;
  response.headers['cache-control'] = { value: 'no-store' };
  response.headers['access-control-allow-origin'] = { value: '*' };
  response.headers['access-control-expose-headers'] = { value: 'Content-Length, Content-Type, Content-Range, Accept-Ranges' };
  response.headers['referrer-policy'] = { value: 'no-referrer' };
  return response;
}
