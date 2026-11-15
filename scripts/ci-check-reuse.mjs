const sha40=value=>/^[0-9a-f]{40}$/i.test(String(value||''));

export function validateCiCheckReuse(env,sha,markerSha){
  if(env.MLK_REPO_CHECKS_ALREADY_PASSED!=='1')throw new Error('Repository-check reuse was not explicitly requested.');
  if(env.GITHUB_ACTIONS!=='true'||!['pull_request','push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)){
    throw new Error('Repository-check reuse is allowed only inside repository-check GitHub Actions.');
  }
  if(!sha40(sha)||markerSha!==sha)throw new Error('Repository-check reuse SHA mismatch; build blocked.');
  if(env.WORKERS_CI!=='1'||env.WORKERS_CI_COMMIT_SHA!==sha){
    throw new Error('Cloudflare dry-run CI revision mismatch; build blocked.');
  }
  const branch=String(env.WORKERS_CI_BRANCH||'');
  if(!branch||branch==='main')throw new Error('Repository-check reuse may not target the production branch.');
  if(String(env.CLOUDFLARE_API_TOKEN||'')||String(env.CLOUDFLARE_ACCOUNT_ID||'')){
    throw new Error('Cloudflare credentials must be absent during repository dry-run validation.');
  }
  return true;
}
