import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// One suite for local checks, CI, and deploys. Fixtures never write live data.
const checks=readdirSync('scripts').filter(name=>/^check-.*\.mjs$/.test(name)).sort();
let failed=0,skipped=0;
for(const name of checks){
 const result=spawnSync(process.execPath,[`scripts/${name}`],{encoding:'utf8'});
 if(result.status===0&&/^SKIP /.test(result.stdout||'')){skipped++;console.log(String(result.stdout).trim().split('\n')[0]);}
 else if(result.status===0)console.log(`PASS ${name}`);
 else{failed++;console.error(`FAIL ${name}\n${result.error||result.stderr||result.stdout}`);}
}
console.log(`${checks.length-failed-skipped}/${checks.length} checks passed`+(skipped?`, ${skipped} skipped (sample data)`:'')+'.');
process.exitCode=failed?1:0;
