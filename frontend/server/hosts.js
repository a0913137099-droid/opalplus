// Permit only this Codespace's exact forwarding hostname, never every GitHub tenant.
export function allowedPreviewHosts(config, port) {
 const hosts=[];
 if(config.PUBLIC_ORIGIN){
  const url=new URL(config.PUBLIC_ORIGIN);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('PUBLIC_ORIGIN 必須是網站來源，例如 https://example.com，不可包含路徑。');
  hosts.push(url.hostname);
 }
 if(config.CODESPACE_NAME){
  const domain=config.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev';
  if(!/^[a-z0-9-]+$/i.test(config.CODESPACE_NAME)||!/^[a-z0-9.-]+$/i.test(domain))throw new Error('Codespaces 轉發設定格式不正確。');
  hosts.push(`${config.CODESPACE_NAME}-${port}.${domain}`);
 }
 return [...new Set(hosts)];
}
